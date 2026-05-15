import {
  ParsedPacket, ParseResult, ParseErrorType, PacketDirection, MIN_PACKET_SIZE,
} from './types';
import { validateCRC, calculateCRC } from './crc';
import { getCommandName } from './constants';

function getDirection(b0: number, b1: number): PacketDirection | null {
  if (b0 === 0xab && b1 === 0x55) return 'app_to_device';
  if (b0 === 0xac && b1 === 0x55) return 'device_to_app';
  return null;
}

// simple version - returns parsed packet or null
export function parsePacket(raw: Uint8Array): ParsedPacket | null {
  const r = parsePacketDetailed(raw);
  return r.success ? r.packet : null;
}

// detailed version with error info (useful for debugging)
export function parsePacketDetailed(raw: Uint8Array): ParseResult {
  if (!raw || raw.length < MIN_PACKET_SIZE) {
    return {
      success: false,
      error: {
        type: ParseErrorType.PACKET_TOO_SHORT,
        message: `too short: need ${MIN_PACKET_SIZE} bytes, got ${raw?.length ?? 0}`,
        partialData: raw ? new Uint8Array(raw) : undefined,
      },
    };
  }

  const direction = getDirection(raw[0], raw[1]);
  if (!direction) {
    return {
      success: false,
      error: {
        type: ParseErrorType.INVALID_HEADER,
        message: `bad header: 0x${raw[0].toString(16)} 0x${raw[1].toString(16)}`,
        partialData: new Uint8Array(raw),
      },
    };
  }

  const lengthField = (raw[2] << 8) | raw[3];

  if (lengthField < 2) {
    return {
      success: false,
      error: {
        type: ParseErrorType.INVALID_LENGTH,
        message: `length field ${lengthField} < minimum 2`,
        partialData: new Uint8Array(raw),
      },
    };
  }

  const totalSize = 4 + lengthField;
  if (raw.length < totalSize) {
    return {
      success: false,
      error: {
        type: ParseErrorType.INCOMPLETE_PACKET,
        message: `incomplete: need ${totalSize} bytes, have ${raw.length}`,
        partialData: new Uint8Array(raw),
      },
    };
  }

  const cmd = raw[4];
  const dataLen = lengthField - 2;
  const data = new Uint8Array(raw.slice(5, 5 + dataLen));
  const crc = raw[5 + dataLen];

  if (!validateCRC(cmd, data, crc)) {
    const expected = calculateCRC(cmd, data);
    return {
      success: false,
      error: {
        type: ParseErrorType.CRC_MISMATCH,
        message: `crc mismatch: got 0x${crc.toString(16)}, expected 0x${expected.toString(16)}`,
        partialData: new Uint8Array(raw.slice(0, totalSize)),
      },
    };
  }

  return {
    success: true,
    packet: {
      direction, command: cmd, commandName: getCommandName(cmd),
      data, crc, crcValid: true,
      raw: new Uint8Array(raw.slice(0, totalSize)),
      length: totalSize,
    },
  };
}
