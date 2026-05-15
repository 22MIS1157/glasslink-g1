// Type definitions for the GlassLink G1 BLE protocol

export type PacketDirection = 'app_to_device' | 'device_to_app';

export enum Command {
  SET_LED_BRIGHTNESS = 0x01,
  GET_BATTERY        = 0x17,
  TAKE_PHOTO         = 0x22,
  ACTION_SYNC        = 0x45,
  CHARGING_STATUS    = 0x53,
  SYNC_TIME          = 0x59,
}

export enum LEDBrightness {
  LOW    = 0x30,
  MEDIUM = 0x31,
  HIGH   = 0x32,
}

export enum PhotoMode {
  PHOTO_ONLY      = 0x30,
  PHOTO_HD_UPLOAD = 0x31,
}

export enum ChargingState {
  NOT_CHARGING = 0x00,
  CHARGING     = 0x01,
}

export enum ActionSyncField {
  PHOTO = 0, RECORDING = 1, MIC = 2,
  VOL_UP = 3, VOL_DOWN = 4, NOD = 5,
  SHAKE = 6, MUSIC = 7, WORN = 8,
}

export const HEADER_APP_TO_DEVICE = new Uint8Array([0xab, 0x55]);
export const HEADER_DEVICE_TO_APP = new Uint8Array([0xac, 0x55]);

// minimum packet = header(2) + length(2) + cmd(1) + crc(1)
export const MIN_PACKET_SIZE = 6;

// upper bound for BLE payload validation
export const MAX_BLE_PAYLOAD = 512;

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

export enum ParseErrorType {
  INVALID_HEADER    = 'INVALID_HEADER',
  PACKET_TOO_SHORT  = 'PACKET_TOO_SHORT',
  CRC_MISMATCH      = 'CRC_MISMATCH',
  INVALID_LENGTH    = 'INVALID_LENGTH',
  INCOMPLETE_PACKET = 'INCOMPLETE_PACKET',
}

export interface ParseError {
  type: ParseErrorType;
  message: string;
  partialData?: Uint8Array;
}

export type ParseResult =
  | { success: true; packet: ParsedPacket }
  | { success: false; error: ParseError };

export interface StreamEvent {
  type: 'packet' | 'error';
  packet?: ParsedPacket;
  error?: ParseError;
  timestamp: number;
}
