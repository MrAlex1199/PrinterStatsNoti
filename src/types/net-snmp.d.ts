declare module 'net-snmp' {
  export interface Session {
    get(oids: string[], callback: (err: Error | null, varbinds?: any[]) => void): void;
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCallback: (varbinds: any[]) => void,
      doneCallback: (err: Error | null) => void
    ): void;
    close(): void;
  }

  const snmp: {
    Version1: number;
    Version2c: number;
    createSession(target: string, community: string, options?: Record<string, unknown>): Session;
    isVarbindError(varbind: any): boolean;
  };
  export default snmp;
}
