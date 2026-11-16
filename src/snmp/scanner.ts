import os from 'node:os';
import snmp from 'net-snmp';

const MAX_SCAN_IPS = 1024;
const OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  hrPrinterStatus: '1.3.6.1.2.1.25.3.5.1.1.1',
};

export interface DiscoveredPrinter {
  ip: string;
  model: string;
  community: string;
  port: number;
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

export function probePrinterSnmp(
  ip: string,
  community = 'public',
  port = 161,
  timeoutMs = 800
): Promise<Omit<DiscoveredPrinter, 'alreadyAdded'> | null> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      port,
      timeout: timeoutMs,
      retries: 0,
      version: snmp.Version2c,
    });

    let settled = false;
    const finish = (val: Omit<DiscoveredPrinter, 'alreadyAdded'> | null) => {
      if (settled) return;
      settled = true;
      try {
        session.close();
      } catch {
        // ignore
      }
      resolve(val);
    };

    session.get([OIDS.sysDescr, OIDS.hrPrinterStatus], (err, varbinds) => {
      if (err || !varbinds || varbinds.length < 2) {
        return finish(null);
      }
      const sysDescrVb = varbinds[0];
      const printerStatusVb = varbinds[1];

      // Confirm this device actually implements Printer-MIB (hrPrinterStatus)
      if (snmp.isVarbindError(printerStatusVb)) {
        return finish(null);
      }

      const model = !snmp.isVarbindError(sysDescrVb) && sysDescrVb.value
        ? String(sysDescrVb.value).trim()
        : `Network Printer (${ip})`;

      finish({ ip, model, community, port });
    });
  });
}

export async function scanTargets(
  ips: string[],
  options: {
    community?: string;
    port?: number;
    concurrency?: number;
    existingIps?: Set<string>;
  } = {},
  probeFn: ProbeFn = probePrinterSnmp
): Promise<DiscoveredPrinter[]> {
  const community = options.community || 'public';
  const port = options.port || 161;
  const concurrency = options.concurrency || 32;
  const existingIps = options.existingIps ?? new Set<string>();

  const found: DiscoveredPrinter[] = [];

  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((ip) => probeFn(ip, community, port).catch(() => null))
    );
    for (const item of results) {
      if (item) {
        found.push({
          ...item,
          alreadyAdded: existingIps.has(item.ip),
        });
      }
    }
  }

  return found;
}
