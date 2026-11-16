import { describe, it, expect } from 'vitest';
import {
  buildMdnsQueryPacket,
  expandIpTargets,
  mergeDiscoveredPrinters,
  parseMdnsResponseIps,
  scanTargets,
} from '../src/snmp/scanner.js';

describe('SNMP Network Scanner', () => {
  it('expands CIDR /30 and IP ranges accurately', () => {
    expect(expandIpTargets('192.168.1.0/30')).toEqual(['192.168.1.1', '192.168.1.2']);
    expect(expandIpTargets('10.0.0.10-10.0.0.12')).toEqual([
      '10.0.0.10',
      '10.0.0.11',
      '10.0.0.12',
    ]);
    expect(expandIpTargets('192.168.1.50')).toEqual(['192.168.1.50']);
  });

  it('rejects subnets larger than 1024 IPs', () => {
    expect(() => expandIpTargets('10.0.0.0/8')).toThrow(/1024/);
  });

  it('scans targets concurrently and marks alreadyAdded printers', async () => {
    const mockProbe = async (ip: string) => {
      if (ip === '192.168.1.1') {
        return { ip, model: 'HP LaserJet Pro', community: 'public', port: 161 };
      }
      if (ip === '192.168.1.2') {
        return { ip, model: 'Canon imageRUNNER', community: 'public', port: 161 };
      }
      return null;
    };

    const results = await scanTargets(
      ['192.168.1.1', '192.168.1.2', '192.168.1.3'],
      { community: 'public', port: 161, existingIps: new Set(['192.168.1.1']) },
      mockProbe
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ ip: '192.168.1.1', model: 'HP LaserJet Pro', alreadyAdded: true });
    expect(results[1]).toMatchObject({ ip: '192.168.1.2', model: 'Canon imageRUNNER', alreadyAdded: false });
  });

  it('merges multi-protocol discoveries by IP and prefers SNMP model names', () => {
    const merged = mergeDiscoveredPrinters([
      { ip: '192.168.0.252', model: 'Network Printer (Port 9100)', community: 'public', port: 161, protocols: ['TCP:9100'], snmpEnabled: false },
      { ip: '192.168.0.252', model: 'KONICA MINOLTA bizhub C251i', community: 'public', port: 161, protocols: ['SNMPv1'], snmpEnabled: true },
      { ip: '192.168.0.201', model: 'KYOCERA ECOSYS M2040dn', community: 'public', port: 161, protocols: ['mDNS'], snmpEnabled: false },
    ]);
    expect(merged).toHaveLength(2);
    const konica = merged.find((m) => m.ip === '192.168.0.252');
    expect(konica?.snmpEnabled).toBe(true);
    expect(konica?.model).toBe('KONICA MINOLTA bizhub C251i');
    expect(konica?.protocols).toContain('SNMPv1');
    expect(konica?.protocols).toContain('TCP:9100');
  });

  it('builds valid mDNS PTR query and extracts IPv4 A records from response buffer', () => {
    const query = buildMdnsQueryPacket('_ipp._tcp.local');
    expect(query.readUInt16BE(4)).toBe(1); // QDCOUNT = 1

    // Minimal DNS response with 1 A-record (type=1, class=1, rdlength=4, ip=192.168.0.239)
    const fakeResp = Buffer.from([
      0x00, 0x00, 0x84, 0x00, // Header: response
      0x00, 0x00, 0x00, 0x01, // QDCOUNT=0, ANCOUNT=1
      0x00, 0x00, 0x00, 0x00, // NSCOUNT=0, ARCOUNT=0
      0x07, ...Buffer.from('printer'), 0x05, ...Buffer.from('local'), 0x00, // name
      0x00, 0x01, // TYPE A
      0x00, 0x01, // CLASS IN
      0x00, 0x00, 0x00, 0x78, // TTL 120
      0x00, 0x04, // RDLENGTH 4
      192, 168, 0, 239, // 192.168.0.239
    ]);
    expect(parseMdnsResponseIps(fakeResp)).toEqual(['192.168.0.239']);
  });
});
