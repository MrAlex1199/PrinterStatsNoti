import { describe, it, expect } from 'vitest';
import { expandIpTargets, scanTargets } from '../src/snmp/scanner.js';

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
});
