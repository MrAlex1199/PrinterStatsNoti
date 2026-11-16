import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';
import snmp from 'net-snmp';

const MAX_SCAN_IPS = 1024;
const OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  hrPrinterStatus: '1.3.6.1.2.1.25.3.5.1.1.1',
  prtGeneralPrinterName: '1.3.6.1.2.1.43.5.1.1.16.1',
  prtMarkerLifeCount: '1.3.6.1.2.1.43.10.2.1.4.1.1',
};

export interface DiscoveredPrinter {
  ip: string;
  model: string;
  community: string;
  port: number;
  protocols?: string[];
  snmpEnabled?: boolean;
  alreadyAdded?: boolean;
}

export type ProbeFn = (
  ip: string,
  community: string,
  port: number
) => Promise<Omit<DiscoveredPrinter, 'alreadyAdded'> | null>;

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.');
}

export function expandIpTargets(input: string): string[] {
  const tokens = input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const results = new Set<string>();

  for (const token of tokens) {
    if (token.includes('/')) {
      const [baseIp, prefixStr] = token.split('/');
      const prefix = Number(prefixStr);
      if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
        throw new Error(`Invalid CIDR prefix: ${token}`);
      }
      const hostCount = 2 ** (32 - prefix);
      if (hostCount > MAX_SCAN_IPS) {
        throw new Error(`Subnet ${token} exceeds maximum allowed ${MAX_SCAN_IPS} IPs per scan`);
      }
      const ipInt = ipToInt(baseIp);
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      const network = (ipInt & mask) >>> 0;
      const broadcast = (network | (~mask >>> 0)) >>> 0;

      const start = prefix >= 31 ? network : network + 1;
      const end = prefix >= 31 ? broadcast : broadcast - 1;
      for (let cur = start; cur <= end; cur++) {
        results.add(intToIp(cur));
        if (results.size > MAX_SCAN_IPS) {
          throw new Error(`Total scan targets exceed ${MAX_SCAN_IPS} IPs`);
        }
      }
    } else if (token.includes('-')) {
      const [startIp, endIp] = token.split('-').map((s) => s.trim());
      const start = ipToInt(startIp);
      const end = ipToInt(endIp);
      if (end < start) {
        throw new Error(`Invalid IP range: ${token}`);
      }
      if (end - start + 1 > MAX_SCAN_IPS) {
        throw new Error(`IP range ${token} exceeds maximum allowed ${MAX_SCAN_IPS} IPs per scan`);
      }
      for (let cur = start; cur <= end; cur++) {
        results.add(intToIp(cur));
        if (results.size > MAX_SCAN_IPS) {
          throw new Error(`Total scan targets exceed ${MAX_SCAN_IPS} IPs`);
        }
      }
    } else {
      ipToInt(token); // validate
      results.add(token);
    }
  }

  return [...results];
}

export function getLocalSubnets(): string[] {
  const nets = os.networkInterfaces();
  const subnets = new Set<string>();
  for (const ifaceList of Object.values(nets)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        if (parts.length === 4) {
          subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`);
        }
      }
    }
  }
  return [...subnets];
}

function getOidsOnce(
  ip: string,
  community: string,
  port: number,
  version: number,
  timeoutMs: number,
  oids: string[]
): Promise<Array<{ oid: string; value: unknown }>> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      port,
      timeout: timeoutMs,
      retries: version === snmp.Version2c ? 1 : 0,
      version,
    });

    let settled = false;
    const finish = (val: Array<{ oid: string; value: unknown }>) => {
      if (settled) return;
      settled = true;
      try {
        session.close();
      } catch {
        // ignore
      }
      resolve(val);
    };

    session.get(oids, (err, varbinds) => {
      if (err || !varbinds) {
        return finish([]);
      }
      const valid = varbinds
        .filter((vb) => !snmp.isVarbindError(vb))
        .map((vb) => ({ oid: vb.oid as string, value: vb.value }));
      finish(valid);
    });
  });
}

async function probeSnmpVersion(
  ip: string,
  community: string,
  port: number,
  version: number,
  timeoutMs: number
): Promise<Omit<DiscoveredPrinter, 'alreadyAdded'> | null> {
  const tag = version === snmp.Version1 ? 'SNMPv1' : 'SNMPv2c';
  let vbs = await getOidsOnce(ip, community, port, version, timeoutMs, [
    OIDS.sysDescr,
    OIDS.hrPrinterStatus,
    OIDS.prtGeneralPrinterName,
    OIDS.prtMarkerLifeCount,
  ]);

  // SNMPv1 rejects the whole packet if any single OID is missing; probe individually
  if (vbs.length === 0 && version === snmp.Version1) {
    const [descrVbs, lifeVbs, nameVbs] = await Promise.all([
      getOidsOnce(ip, community, port, version, timeoutMs, [OIDS.sysDescr]),
      getOidsOnce(ip, community, port, version, timeoutMs, [OIDS.prtMarkerLifeCount]),
      getOidsOnce(ip, community, port, version, timeoutMs, [OIDS.prtGeneralPrinterName]),
    ]);
    vbs = [...descrVbs, ...lifeVbs, ...nameVbs];
  }

  if (vbs.length === 0) return null;

  const map = new Map(vbs.map((v) => [v.oid, v.value]));
  const hasPrinterMib =
    map.has(OIDS.hrPrinterStatus) ||
    map.has(OIDS.prtGeneralPrinterName) ||
    map.has(OIDS.prtMarkerLifeCount);

  if (!hasPrinterMib) return null;

  const generalName = map.get(OIDS.prtGeneralPrinterName);
  const sysDescr = map.get(OIDS.sysDescr);
  const model =
    (generalName ? String(generalName).trim() : '') ||
    (sysDescr ? String(sysDescr).trim() : '') ||
    `Network Printer (${ip})`;

  return {
    ip,
    model,
    community,
    port,
    protocols: [tag],
    snmpEnabled: true,
  };
}

export async function probePrinterSnmp(
  ip: string,
  community = 'public',
  port = 161,
  timeoutMs = 1500
): Promise<Omit<DiscoveredPrinter, 'alreadyAdded'> | null> {
  const v2 = await probeSnmpVersion(ip, community, port, snmp.Version2c, timeoutMs);
  if (v2) return v2;
  return probeSnmpVersion(ip, community, port, snmp.Version1, 1200);
}

export function checkTcpPort(ip: string, port: number, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, ip);
  });
}

export async function probeTcpPrinterPorts(
  ip: string,
  community = 'public',
  snmpPort = 161
): Promise<Omit<DiscoveredPrinter, 'alreadyAdded'> | null> {
  const [has9100, has631] = await Promise.all([
    checkTcpPort(ip, 9100, 600),
    checkTcpPort(ip, 631, 600),
  ]);
  if (!has9100 && !has631) return null;

  const protocols: string[] = [];
  if (has9100) protocols.push('TCP:9100');
  if (has631) protocols.push('IPP:631');

  return {
    ip,
    model: `Network Printer (${protocols.join(' / ')})`,
    community,
    port: snmpPort,
    protocols,
    snmpEnabled: false,
  };
}

export function buildMdnsQueryPacket(serviceName: string): Buffer {
  const labels = serviceName.split('.').filter(Boolean);
  const nameParts: Buffer[] = [];
  for (const label of labels) {
    const b = Buffer.from(label, 'utf8');
    nameParts.push(Buffer.from([b.length]), b);
  }
  nameParts.push(Buffer.from([0x00]));
  const qname = Buffer.concat(nameParts);

  const header = Buffer.alloc(12, 0);
  header.writeUInt16BE(1, 4); // QDCOUNT = 1

  const footer = Buffer.alloc(4);
  footer.writeUInt16BE(12, 0); // QTYPE = PTR (12)
  footer.writeUInt16BE(1, 2); // QCLASS = IN (1)

  return Buffer.concat([header, qname, footer]);
}

function skipDnsName(buf: Buffer, offset: number): number {
  let pos = offset;
  while (pos < buf.length) {
    const len = buf[pos];
    if (len === 0) return pos + 1;
    if ((len & 0xc0) === 0xc0) return pos + 2; // compression pointer
    pos += 1 + len;
  }
  return buf.length;
}

export function parseMdnsResponseIps(buf: Buffer): string[] {
  if (buf.length < 12) return [];
  const qdCount = buf.readUInt16BE(4);
  const anCount = buf.readUInt16BE(6);
  const nsCount = buf.readUInt16BE(8);
  const arCount = buf.readUInt16BE(10);
  const totalRecords = anCount + nsCount + arCount;

  let pos = 12;
  for (let i = 0; i < qdCount && pos < buf.length; i++) {
    pos = skipDnsName(buf, pos) + 4;
  }

  const ips = new Set<string>();
  for (let i = 0; i < totalRecords && pos + 10 <= buf.length; i++) {
    pos = skipDnsName(buf, pos);
    if (pos + 10 > buf.length) break;
    const type = buf.readUInt16BE(pos);
    const rdLength = buf.readUInt16BE(pos + 8);
    pos += 10;
    if (pos + rdLength > buf.length) break;
    if (type === 1 && rdLength === 4) {
      const ip = `${buf[pos]}.${buf[pos + 1]}.${buf[pos + 2]}.${buf[pos + 3]}`;
      if (!ip.startsWith('127.')) ips.add(ip);
    }
    pos += rdLength;
  }
  return [...ips];
}

export function discoverMdnsIps(timeoutMs = 1500): Promise<string[]> {
  return new Promise((resolve) => {
    const ips = new Set<string>();
    let socket: dgram.Socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      return resolve([]);
    }

    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve([...ips]);
    }, timeoutMs);

    socket.on('error', () => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve([...ips]);
    });

    socket.on('message', (msg) => {
      for (const ip of parseMdnsResponseIps(msg)) {
        ips.add(ip);
      }
    });

    socket.bind(0, () => {
      const queries = [
        buildMdnsQueryPacket('_ipp._tcp.local'),
        buildMdnsQueryPacket('_printer._tcp.local'),
      ];
      for (const q of queries) {
        socket.send(q, 5353, '224.0.0.251');
      }
    });
  });
}

export function mergeDiscoveredPrinters(
  items: Array<Omit<DiscoveredPrinter, 'alreadyAdded'>>
): Array<Omit<DiscoveredPrinter, 'alreadyAdded'>> {
  const byIp = new Map<string, Omit<DiscoveredPrinter, 'alreadyAdded'>>();

  for (const item of items) {
    const existing = byIp.get(item.ip);
    if (!existing) {
      byIp.set(item.ip, {
        ...item,
        protocols: [...new Set(item.protocols ?? [])],
      });
      continue;
    }

    const mergedProtocols = [
      ...new Set([...(existing.protocols ?? []), ...(item.protocols ?? [])]),
    ];
    const snmpEnabled = Boolean(existing.snmpEnabled || item.snmpEnabled);
    // Prefer SNMP model name over generic TCP/mDNS fallback label
    const model = item.snmpEnabled && !existing.snmpEnabled ? item.model : existing.model;

    byIp.set(item.ip, {
      ...existing,
      model,
      snmpEnabled,
      protocols: mergedProtocols,
    });
  }

  return [...byIp.values()];
}

export async function scanTargets(
  ips: string[],
  options: {
    community?: string;
    communities?: string[];
    port?: number;
    concurrency?: number;
    useTcpPorts?: boolean;
    useMdns?: boolean;
    existingIps?: Set<string>;
  } = {},
  probeFn?: ProbeFn
): Promise<DiscoveredPrinter[]> {
  const communities = options.communities?.length
    ? options.communities
    : (options.community || 'public')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
  const port = options.port || 161;
  const concurrency = options.concurrency || 32;
  const existingIps = options.existingIps ?? new Set<string>();
  const useTcpPorts = options.useTcpPorts ?? true;
  const useMdns = options.useMdns ?? false;

  const rawDiscovered: Array<Omit<DiscoveredPrinter, 'alreadyAdded'>> = [];

  const allTargets = new Set(ips);
  if (useMdns && !probeFn) {
    const mdnsIps = await discoverMdnsIps(1500);
    for (const ip of mdnsIps) {
      allTargets.add(ip);
      rawDiscovered.push({
        ip,
        model: `mDNS Printer (${ip})`,
        community: communities[0] || 'public',
        port,
        protocols: ['mDNS'],
        snmpEnabled: false,
      });
    }
  }

  const targetList = [...allTargets];

  for (let i = 0; i < targetList.length; i += concurrency) {
    const batch = targetList.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (ip) => {
        if (probeFn) {
          return probeFn(ip, communities[0] || 'public', port).catch(() => null);
        }

        // Try each SNMP community (v2c + v1)
        for (const comm of communities) {
          const snmpRes = await probePrinterSnmp(ip, comm, port).catch(() => null);
          if (snmpRes) return snmpRes;
        }

        // Fallback to TCP 9100 / 631 IPP if SNMP didn't answer
        if (useTcpPorts) {
          return probeTcpPrinterPorts(ip, communities[0] || 'public', port).catch(() => null);
        }
        return null;
      })
    );

    for (const item of batchResults) {
      if (item) rawDiscovered.push(item);
    }
  }

  const merged = mergeDiscoveredPrinters(rawDiscovered);
  return merged.map((item) => ({
    ...item,
    alreadyAdded: existingIps.has(item.ip),
  }));
}
