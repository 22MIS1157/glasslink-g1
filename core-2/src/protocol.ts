// Browser-compatible protocol library for the simulator
// Self-contained, no Node dependencies

export type PacketDirection = 'app_to_device' | 'device_to_app';

export enum Command {
  SET_LED_BRIGHTNESS = 0x01,
  GET_BATTERY        = 0x17,
  TAKE_PHOTO         = 0x22,
  ACTION_SYNC        = 0x45,
  CHARGING_STATUS    = 0x53,
  SYNC_TIME          = 0x59,
}

export enum LEDBrightness { LOW = 0x30, MEDIUM = 0x31, HIGH = 0x32 }
export enum PhotoMode { PHOTO_ONLY = 0x30, PHOTO_HD_UPLOAD = 0x31 }
export enum ChargingState { NOT_CHARGING = 0x00, CHARGING = 0x01 }

export const HEADER_A2D = new Uint8Array([0xab, 0x55]);
export const HEADER_D2A = new Uint8Array([0xac, 0x55]);

export interface ParsedPacket {
  direction: PacketDirection;
  command: number;
  commandName: string;
  data: Uint8Array;
  crc: number;
  crcValid: boolean;
  raw: Uint8Array;
  length: number;
}

export interface LogEntry {
  id: number;
  timestamp: Date;
  direction: 'app_to_device' | 'device_to_app';
  raw: Uint8Array;
  parsed: ParsedPacket | null;
  interpretation: string;
  error?: string;
  corrupted?: boolean;
}

const CMD_NAMES: Record<number, string> = {
  [Command.SET_LED_BRIGHTNESS]: 'Set LED Brightness',
  [Command.GET_BATTERY]:        'Get Battery',
  [Command.TAKE_PHOTO]:         'Take Photo',
  [Command.ACTION_SYNC]:        'Action Sync',
  [Command.CHARGING_STATUS]:    'Charging Status',
  [Command.SYNC_TIME]:          'Sync Phone Time',
};

function cmdName(c: number): string {
  return CMD_NAMES[c] ?? `Unknown (0x${c.toString(16).padStart(2, '0').toUpperCase()})`;
}

// CRC = (cmd + sum of data bytes) & 0xFF
export function calculateCRC(cmd: number, data: Uint8Array): number {
  let s = cmd;
  for (let i = 0; i < data.length; i++) s += data[i];
  return s & 0xff;
}

export function buildPacket(
  cmd: number, data: Uint8Array, direction: PacketDirection = 'app_to_device',
): Uint8Array {
  const header = direction === 'app_to_device' ? HEADER_A2D : HEADER_D2A;
  const len = data.length + 2;
  const crc = calculateCRC(cmd, data);
  const pkt = new Uint8Array(data.length + 6);
  pkt[0] = header[0];
  pkt[1] = header[1];
  pkt[2] = (len >> 8) & 0xff;
  pkt[3] = len & 0xff;
  pkt[4] = cmd;
  pkt.set(data, 5);
  pkt[pkt.length - 1] = crc;
  return pkt;
}

function getDir(b0: number, b1: number): PacketDirection | null {
  if (b0 === 0xab && b1 === 0x55) return 'app_to_device';
  if (b0 === 0xac && b1 === 0x55) return 'device_to_app';
  return null;
}

export function parsePacket(raw: Uint8Array): ParsedPacket | null {
  if (!raw || raw.length < 6) return null;
  const dir = getDir(raw[0], raw[1]);
  if (!dir) return null;
  const lenField = (raw[2] << 8) | raw[3];
  if (lenField < 2) return null;
  const total = 4 + lenField;
  if (raw.length < total) return null;
  const cmd = raw[4];
  const dataLen = lenField - 2;
  const data = new Uint8Array(raw.slice(5, 5 + dataLen));
  const crc = raw[5 + dataLen];
  if (crc !== calculateCRC(cmd, data)) return null;
  return {
    direction: dir, command: cmd, commandName: cmdName(cmd),
    data, crc, crcValid: true,
    raw: new Uint8Array(raw.slice(0, total)), length: total,
  };
}

export function interpretPacket(p: ParsedPacket): string {
  const dir = p.direction === 'app_to_device' ? 'App -> Device' : 'Device -> App';
  switch (p.command) {
    case Command.SET_LED_BRIGHTNESS: {
      const names: Record<number, string> = { 0x30: 'Low', 0x31: 'Medium', 0x32: 'High' };
      return `${dir} | Set LED -> ${names[p.data[0]] ?? '?'}`;
    }
    case Command.GET_BATTERY:
      if (p.direction === 'device_to_app' && p.data.length >= 2)
        return `${dir} | Battery ${p.data[0]}% (${p.data[1] ? 'charging' : 'not charging'})`;
      return `${dir} | Get Battery (request)`;
    case Command.TAKE_PHOTO: {
      const m: Record<number, string> = { 0x30: 'Photo Only', 0x31: 'Photo + HD' };
      return `${dir} | Take Photo -> ${m[p.data[0]] ?? '?'}`;
    }
    case Command.ACTION_SYNC: {
      const labels = ['photo','recording','mic','vol+','vol-','nod','shake','music','worn'];
      const active = labels.filter((_, i) => p.data[i]);
      return `${dir} | Action Sync -> [${active.length ? active.join(', ') : 'idle'}]`;
    }
    case Command.CHARGING_STATUS:
      if (p.data.length >= 2)
        return `${dir} | ${p.data[0] ? 'Charging' : 'Not Charging'}, ${p.data[1]}%`;
      return `${dir} | Charging Status (malformed)`;
    case Command.SYNC_TIME: {
      if (p.data.length < 7) return `${dir} | Sync Time (incomplete)`;
      const y = (p.data[0] << 8) | p.data[1];
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${dir} | Sync -> ${y}-${pad(p.data[2])}-${pad(p.data[3])} ${pad(p.data[4])}:${pad(p.data[5])}:${pad(p.data[6])}`;
    }
    default:
      return `${dir} | Unknown 0x${p.command.toString(16).padStart(2,'0')}`;
  }
}

// chaos mode: randomly corrupt a packet
export function corruptPacket(pkt: Uint8Array): { data: Uint8Array; method: string } {
  const copy = new Uint8Array(pkt);
  const roll = Math.random();
  if (roll < 0.33) {
    const idx = Math.floor(Math.random() * copy.length);
    copy[idx] ^= (1 << Math.floor(Math.random() * 8));
    return { data: copy, method: 'byte-flip' };
  } else if (roll < 0.66) {
    const newLen = Math.max(2, Math.floor(copy.length * (0.3 + Math.random() * 0.5)));
    return { data: copy.slice(0, newLen), method: 'truncation' };
  } else {
    copy[copy.length - 1] ^= 0xff;
    return { data: copy, method: 'bad-crc' };
  }
}
