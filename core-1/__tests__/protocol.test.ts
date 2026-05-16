import {
  buildPacket, parsePacket, parsePacketDetailed, interpretPacket,
  StreamBuffer, Command, LEDBrightness, PhotoMode, ChargingState, ParseErrorType,
} from '../src';

// --- round trip tests for each command ---

describe('round trip: build -> parse -> interpret', () => {
  test('SET_LED_BRIGHTNESS low', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.LOW]));
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(parsed!.command).toBe(Command.SET_LED_BRIGHTNESS);
    expect(parsed!.data).toEqual(new Uint8Array([LEDBrightness.LOW]));
    expect(interpretPacket(parsed!)).toContain('Low');
  });

  test('SET_LED_BRIGHTNESS high', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.HIGH]));
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(interpretPacket(parsed!)).toContain('High');
  });

  test('GET_BATTERY request (empty data)', () => {
    const pkt = buildPacket(Command.GET_BATTERY, new Uint8Array([]));
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(parsed!.data.length).toBe(0);
    expect(interpretPacket(parsed!)).toContain('Get Battery');
  });

  test('GET_BATTERY reply from device', () => {
    const pkt = buildPacket(Command.GET_BATTERY, new Uint8Array([85, ChargingState.CHARGING]), 'device_to_app');
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(parsed!.direction).toBe('device_to_app');
    expect(interpretPacket(parsed!)).toContain('85%');
  });

  test('TAKE_PHOTO photo only', () => {
    const pkt = buildPacket(Command.TAKE_PHOTO, new Uint8Array([PhotoMode.PHOTO_ONLY]));
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(interpretPacket(parsed!)).toContain('Photo Only');
  });

  test('ACTION_SYNC with nod and photo', () => {
    const data = new Uint8Array(9);
    data[0] = 1; // photo
    data[5] = 1; // nod
    const pkt = buildPacket(Command.ACTION_SYNC, data, 'device_to_app');
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    const text = interpretPacket(parsed!);
    expect(text).toContain('photo');
    expect(text).toContain('nod');
  });

  test('CHARGING_STATUS', () => {
    const pkt = buildPacket(Command.CHARGING_STATUS, new Uint8Array([1, 72]), 'device_to_app');
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(interpretPacket(parsed!)).toContain('72%');
  });

  test('SYNC_TIME', () => {
    const year = 2026;
    const data = new Uint8Array([(year >> 8) & 0xff, year & 0xff, 5, 16, 14, 30, 0]);
    const pkt = buildPacket(Command.SYNC_TIME, data);
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(interpretPacket(parsed!)).toContain('2026');
  });
});

// --- CRC failure ---

describe('CRC failure', () => {
  test('flipped CRC returns null', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.HIGH]));
    pkt[pkt.length - 1] ^= 0xff;
    expect(parsePacket(pkt)).toBeNull();
  });

  test('detailed API returns CRC_MISMATCH', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.HIGH]));
    pkt[pkt.length - 1] ^= 0x01;
    const result = parsePacketDetailed(pkt);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe(ParseErrorType.CRC_MISMATCH);
  });

  test('corrupted data byte causes CRC fail', () => {
    const pkt = buildPacket(Command.TAKE_PHOTO, new Uint8Array([PhotoMode.PHOTO_ONLY]));
    pkt[5] = 0xff;
    expect(parsePacket(pkt)).toBeNull();
  });
});

// --- truncated / incomplete ---

describe('truncated input', () => {
  test('empty buffer', () => { expect(parsePacket(new Uint8Array([]))).toBeNull(); });
  test('1 byte', () => { expect(parsePacket(new Uint8Array([0xab]))).toBeNull(); });
  test('header only', () => { expect(parsePacket(new Uint8Array([0xab, 0x55]))).toBeNull(); });

  test('chopped mid-data', () => {
    const pkt = buildPacket(Command.SYNC_TIME, new Uint8Array([0x07, 0xea, 5, 16, 14, 30, 0]));
    expect(parsePacket(pkt.slice(0, pkt.length - 3))).toBeNull();
  });

  test('returns INCOMPLETE_PACKET error', () => {
    const pkt = buildPacket(Command.SYNC_TIME, new Uint8Array([0x07, 0xea, 5, 16, 14, 30, 0]));
    const result = parsePacketDetailed(pkt.slice(0, pkt.length - 2));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe(ParseErrorType.INCOMPLETE_PACKET);
  });
});

// --- bad headers ---

describe('invalid headers', () => {
  test('wrong first byte', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.LOW]));
    pkt[0] = 0xff;
    expect(parsePacket(pkt)).toBeNull();
  });

  test('swapped header bytes', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.LOW]));
    pkt[0] = 0x55; pkt[1] = 0xab;
    expect(parsePacket(pkt)).toBeNull();
  });
});

// --- edge cases ---

describe('edge cases', () => {
  test('unknown command still parses', () => {
    const pkt = buildPacket(0xfe, new Uint8Array([0x42]));
    const parsed = parsePacket(pkt);
    expect(parsed).not.toBeNull();
    expect(parsed!.commandName).toContain('Unknown');
  });

  test('all-0xFF data', () => {
    const data = new Uint8Array(10).fill(0xff);
    const pkt = buildPacket(0x01, data);
    expect(parsePacket(pkt)).not.toBeNull();
  });

  test('builder rejects cmd > 0xFF', () => {
    expect(() => buildPacket(0x100, new Uint8Array([]))).toThrow();
  });

  test('invalid length field < 2', () => {
    const raw = new Uint8Array([0xab, 0x55, 0x00, 0x01, 0x01, 0x01]);
    const result = parsePacketDetailed(raw);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe(ParseErrorType.INVALID_LENGTH);
  });

  test('extra trailing bytes ignored', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.HIGH]));
    const extended = new Uint8Array(pkt.length + 5);
    extended.set(pkt, 0);
    const parsed = parsePacket(extended);
    expect(parsed).not.toBeNull();
    expect(parsed!.length).toBe(pkt.length);
  });
});

// --- stream buffer: concatenated ---

describe('StreamBuffer: concatenated packets', () => {
  test('two packets in one push', () => {
    const sb = new StreamBuffer();
    const events: string[] = [];
    sb.onEvent(e => events.push(e.type));

    const p1 = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.LOW]));
    const p2 = buildPacket(Command.TAKE_PHOTO, new Uint8Array([PhotoMode.PHOTO_ONLY]));
    const combined = new Uint8Array(p1.length + p2.length);
    combined.set(p1, 0);
    combined.set(p2, p1.length);

    sb.push(combined);
    expect(sb.parsedCount).toBe(2);
  });
});

// --- stream buffer: fragmented ---

describe('StreamBuffer: fragmented packets', () => {
  test('byte by byte', () => {
    const sb = new StreamBuffer();
    sb.onEvent(() => {});
    const pkt = buildPacket(Command.SYNC_TIME, new Uint8Array([0x07, 0xea, 5, 16, 14, 30, 0]));
    for (let i = 0; i < pkt.length; i++) sb.push(new Uint8Array([pkt[i]]));
    expect(sb.parsedCount).toBe(1);
  });

  test('split in half', () => {
    const sb = new StreamBuffer();
    sb.onEvent(() => {});
    const pkt = buildPacket(Command.ACTION_SYNC, new Uint8Array(9).fill(0), 'device_to_app');
    const mid = Math.floor(pkt.length / 2);
    sb.push(pkt.slice(0, mid));
    expect(sb.parsedCount).toBe(0);
    sb.push(pkt.slice(mid));
    expect(sb.parsedCount).toBe(1);
  });
});

// --- stream buffer: garbage recovery ---

describe('StreamBuffer: garbage recovery', () => {
  test('garbage before valid packet', () => {
    const sb = new StreamBuffer();
    sb.onEvent(() => {});
    const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.MEDIUM]));
    const combined = new Uint8Array(garbage.length + pkt.length);
    combined.set(garbage, 0);
    combined.set(pkt, garbage.length);
    sb.push(combined);
    expect(sb.parsedCount).toBe(1);
    expect(sb.errorCount).toBeGreaterThan(0);
  });

  test('reset clears everything', () => {
    const sb = new StreamBuffer();
    sb.push(new Uint8Array([0xab, 0x55]));
    expect(sb.pending).toBeGreaterThan(0);
    sb.reset();
    expect(sb.pending).toBe(0);
  });
});

// --- direction ---

describe('direction detection', () => {
  test('app_to_device', () => {
    const pkt = buildPacket(Command.SET_LED_BRIGHTNESS, new Uint8Array([LEDBrightness.LOW]), 'app_to_device');
    expect(parsePacket(pkt)!.direction).toBe('app_to_device');
  });

  test('device_to_app', () => {
    const pkt = buildPacket(Command.CHARGING_STATUS, new Uint8Array([0x01, 80]), 'device_to_app');
    expect(parsePacket(pkt)!.direction).toBe('device_to_app');
  });
});

// --- listener management ---

describe('StreamBuffer listeners', () => {
  test('unsubscribe stops events', () => {
    const sb = new StreamBuffer();
    let count = 0;
    const unsub = sb.onEvent(() => count++);
    sb.push(buildPacket(Command.GET_BATTERY, new Uint8Array([])));
    expect(count).toBe(1);
    unsub();
    sb.push(buildPacket(Command.GET_BATTERY, new Uint8Array([])));
    expect(count).toBe(1);
  });
});
