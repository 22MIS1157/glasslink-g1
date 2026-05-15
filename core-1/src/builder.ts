import {
  PacketDirection, HEADER_APP_TO_DEVICE, HEADER_DEVICE_TO_APP, MAX_BLE_PAYLOAD,
} from './types';
import { calculateCRC } from './crc';

export function buildPacket(
  cmd: number,
  data: Uint8Array,
  direction: PacketDirection = 'app_to_device',
): Uint8Array {
  if (cmd < 0 || cmd > 0xff || !Number.isInteger(cmd)) {
    throw new Error(`cmd must be 0x00-0xFF, got ${cmd}`);
  }
  if (data.length > MAX_BLE_PAYLOAD) {
    throw new Error(`data too large: ${data.length} bytes (max ${MAX_BLE_PAYLOAD})`);
  }

  const header = direction === 'app_to_device' ? HEADER_APP_TO_DEVICE : HEADER_DEVICE_TO_APP;
  const lengthVal = data.length + 2; // cmd + data + crc
  const crc = calculateCRC(cmd, data);

  const pkt = new Uint8Array(data.length + 6);
  pkt[0] = header[0];
  pkt[1] = header[1];
  pkt[2] = (lengthVal >> 8) & 0xff;
  pkt[3] = lengthVal & 0xff;
  pkt[4] = cmd;
  pkt.set(data, 5);
  pkt[pkt.length - 1] = crc;

  return pkt;
}
