// CRC = (cmd + sum of all data bytes) & 0xFF

export function calculateCRC(cmd: number, data: Uint8Array): number {
  let sum = cmd;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum & 0xff;
}

export function validateCRC(cmd: number, data: Uint8Array, expected: number): boolean {
  return calculateCRC(cmd, data) === expected;
}
