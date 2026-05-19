# GlassLink G1 - BLE Protocol Simulator

A companion app protocol implementation for the GlassLink G1 smart glasses. Built as part of the IoT and BLE Application Developer internship assignment.

This repo has three parts:
- `core-1/` - Protocol parser library (TypeScript, tested with Jest)
- `core-2/` - Live simulator UI (React + Vite)
- `bonus/` - Multilingual voice intent classifier (Option B)

---

## How to Run

You need Node.js >= 18 and npm. That's it, no other dependencies.

### Core 1 - Protocol Parser (run tests)

```bash
cd core-1
npm install
npm test
```

This runs 15+ unit tests. All should pass. If something breaks on your machine, it's probably a Node version issue - I developed this on Node 22.

### Core 2 - Simulator UI

```bash
cd core-2
npm install
npm run dev
```

Opens at http://localhost:3000. You'll see two panels (device and app) with a packet log below.

### Bonus - Voice Intent Classifier

```bash
cd bonus
npm install
npm run dev
```

Opens at http://localhost:3001. Type any command in English, Hindi, or Telugu and it classifies the intent.

---

## Project Structure

```
glasslink-g1/
├── core-1/
│   ├── src/
│   │   ├── types.ts          - all the type definitions and enums
│   │   ├── crc.ts            - CRC calculation logic
│   │   ├── constants.ts      - command name mappings
│   │   ├── builder.ts        - buildPacket()
│   │   ├── parser.ts         - parsePacket() and parsePacketDetailed()
│   │   ├── interpreter.ts    - interpretPacket() for human readable output
│   │   ├── streamBuffer.ts   - handles fragmented/concatenated BLE packets
│   │   └── index.ts          - barrel exports
│   └── __tests__/
│       └── protocol.test.ts  - 15+ tests
├── core-2/
│   └── src/
│       ├── protocol.ts       - browser-compatible protocol lib
│       ├── App.tsx            - main simulator component
│       ├── index.css          - styling
│       └── main.tsx           - entry point
├── bonus/
│   ├── DESIGN.md             - 1 page design document
│   └── src/
│       ├── classifier.ts     - intent classification engine
│       ├── App.tsx            - classifier UI
│       ├── index.css          - styling
│       └── main.tsx           - entry point
└── README.md
```

---

## Core Feature 1 - Protocol Parser

### What it does

Three functions, as asked in the spec:

1. **buildPacket(cmd, data, direction)** - takes a command byte and data, returns a complete Uint8Array packet with header, length, and CRC calculated
2. **parsePacket(raw)** - takes raw bytes, validates everything, returns a parsed object or null if anything is wrong
3. **interpretPacket(parsed)** - takes the parsed object and returns a readable string like "App to Device | Set LED Brightness -> High"

There's also a `parsePacketDetailed()` variant that returns structured error info instead of just null. I added this because during debugging I kept getting null and had no idea what went wrong - was it the CRC? the header? truncation? So I made a version that tells you exactly what failed.

### Packet format (for reference)

```
Header (2B) | Length (2B, big-endian) | Command (1B) | Data (NB) | CRC (1B)

Header:  0xAB 0x55 = app to device
         0xAC 0x55 = device to app
Length:  covers cmd(1) + data(N) + crc(1) = N + 2
CRC:    (cmd + sum(data)) & 0xFF
```

### StreamBuffer - the fragmentation handler

This was the most interesting part to build. The spec mentions that packets can arrive concatenated or fragmented across BLE notifications but doesn't say how to handle it. I looked up how BLE actually works - the default ATT MTU in BLE 4.2 is 23 bytes, which means only 20 bytes of actual payload after the ATT header. So a packet larger than 20 bytes will definitely get split across multiple notifications.

My `StreamBuffer` class works like this:
- You push raw bytes into it (simulating BLE notifications arriving)
- It maintains an internal buffer and keeps scanning for valid header bytes (0xAB55 or 0xAC55)
- Once it finds a header, it reads the length field and waits until it has enough bytes
- If the CRC check passes, it emits the packet via a callback
- If there's garbage before the header (like from a corrupted packet), it skips those bytes and reports an error
- Then it continues scanning - so multiple concatenated packets in one push all get extracted

I spent a good amount of time on the drain() loop inside StreamBuffer. Initially I had an infinite loop bug where if the buffer had invalid data that didn't match any header, it would just keep scanning forever. Added a safety counter to prevent that.

Reference: Bluetooth Core Specification v5.3, Vol 3, Part F, Section 3.2.9 - this is where MTU negotiation is defined. I didn't implement MTU negotiation obviously (no real hardware), but I wanted to understand why fragmentation happens in the first place.

### All 6 commands supported

| Cmd | Name | Data |
|-----|------|------|
| 0x01 | Set LED Brightness | 0x30=low, 0x31=medium, 0x32=high |
| 0x17 | Get Battery | Reply: [level%, charging_status] |
| 0x22 | Take Photo | 0x30=photo only, 0x31=photo+HD |
| 0x45 | Action Sync | 9 bytes (device to app) |
| 0x53 | Charging Status | [charging_flag, level%] (device to app) |
| 0x59 | Sync Phone Time | [year_hi, year_lo, month, day, hour, min, sec] |

---

## Core Feature 2 - Live Simulator

### Layout

The UI has three sections:
- **Device Panel** (top left) - simulates the glasses. Has buttons to trigger events like photo taken, nod detected, head shake, battery drain, plug/unplug charger, and wear/remove glasses. Each button builds the correct packet using the core-1 protocol code.
- **App Panel** (top right) - simulates the phone. Shows the current device state (battery, LED, charging status) and has controls to send commands back - set LED brightness, take photo, get battery, sync time.
- **Packet Log** (bottom, full width) - styled like a terminal/serial monitor. Shows every packet exchanged with timestamp, direction (TX for app-to-device, RX for device-to-app), parsed interpretation, and raw hex bytes.

### Chaos Mode

There's a toggle in the top bar. When enabled, 10% of outgoing packets get randomly corrupted using one of three methods:
- **byte-flip**: picks a random byte and flips a random bit
- **truncation**: chops the packet to a random shorter length
- **bad-crc**: inverts the CRC byte (XOR with 0xFF)

The receiving side (parsePacket) handles all three gracefully - returns null instead of crashing, and the log shows it as a red error entry with the corruption method labeled.

I tested this by rapidly clicking buttons with chaos mode on. At ~10% rate, you see a nice mix of successful and failed packets. The parser never crashes regardless of what garbage you throw at it.

---

## Assumptions and Decisions

These are the things the spec didn't clearly define, and what I chose to do about them:

### 1. "0x00 if empty" - what does this mean?

The spec says data is "0x00 if empty". I wasn't sure if this means:
- (a) when there's no data, put a single 0x00 byte as placeholder, or
- (b) it's just documentation saying "the field is zero bytes when empty"

I went with (b) - empty data means zero length, no bytes. My reasoning: if we always put 0x00 for empty commands, then there's no way to distinguish between "no data" and "data is literally the value zero". For GET_BATTERY request (app to device), there's no meaningful data to send, so length field = 2 (just cmd + crc).

### 2. CRC only covers cmd + data, not the header

The CRC formula is `(cmd + sum(data)) & 0xFF`. This means the header bytes and length field are NOT protected by the CRC. So if the header gets corrupted, we detect it structurally (invalid header bytes), not via CRC. If the length field gets corrupted, we detect it by either running out of bytes or finding an impossible value.

I think this is a weakness in the protocol - in a real product I'd want the CRC to cover the length field at minimum. But I implemented it exactly as specified.

### 3. Same command, both directions

GET_BATTERY (0x17) can be sent both ways - the app sends it as a request with empty data, and the device replies with [level%, charging_status]. The direction is determined purely by the header bytes (0xAB55 vs 0xAC55), not the command.

### 4. Unknown commands are accepted

If I receive a command byte that's not in the table (say 0xFE), I still parse it successfully. I just label it as "Unknown (0xFE)" in the interpretation. This follows the robustness principle - be liberal in what you accept. The spec only lists 6 commands, but there might be more in the real firmware that I don't know about.

### 5. Concatenated and fragmented packets

The spec asks "what happens when two packets arrive concatenated?" - my StreamBuffer handles this by draining the buffer in a loop, extracting one packet at a time until no more complete packets remain.

For fragmented packets: the buffer just accumulates bytes across multiple push() calls until it has enough for a complete packet based on the length field.

For corrupted packets in a stream: if CRC fails, the bytes are consumed and an error is emitted. The buffer moves past those bytes and looks for the next valid header. This way one bad packet doesn't corrupt the entire stream.

---

## What I'd Do Differently With More Time

1. **Acknowledgment protocol** - right now it's fire-and-forget. In a real BLE connection you'd want ACK/NACK so the sender knows if the receiver got the packet. I'd add a sequence number to each packet and an ACK command.

2. **Property-based testing** - I have 15+ hand-written tests which is decent, but something like fast-check would generate thousands of random packets and verify that buildPacket -> parsePacket always round-trips correctly. This would catch edge cases I haven't thought of.

3. **WebSocket or SharedWorker** - currently the device and app panels are just React state in the same component. In a real simulation you'd want them in separate processes communicating over WebSocket to actually simulate the BLE link with realistic latency and packet loss.

4. **React Native port** - the assignment mentions React Native for the actual job. I used React (web) for the simulator because it's faster to develop and easier to demo, but the protocol code is framework-agnostic and would work in RN without changes.

5. **GATT service definition** - I'd define the BLE service UUID, characteristic UUIDs, and their read/write/notify properties. This is what you'd actually need to connect to real hardware with react-native-ble-plx.

6. **Better error recovery** - my StreamBuffer skips to the next valid header on error, but it could be smarter. For example, if a header byte (0xAB) appears inside the data payload of a legitimate packet, the current code might incorrectly try to parse from that position. A more robust approach would be to validate the length field before committing to a header match.

---

## Edge Cases I Handle

| Scenario | What happens |
|----------|-------------|
| Empty buffer | parsePacket returns null |
| 1-byte input | returns null (too short) |
| Valid header but truncated data | returns null with INCOMPLETE_PACKET error |
| CRC mismatch | returns null with CRC_MISMATCH error |
| Two packets concatenated | StreamBuffer extracts both |
| Packet split across multiple pushes | StreamBuffer reassembles it |
| Garbage bytes before a valid packet | StreamBuffer skips garbage, reports error, then parses the packet |
| Unknown command byte | Parses fine, labeled "Unknown" |
| Length field < 2 | Rejected (minimum is cmd + crc = 2) |
| Cmd byte > 0xFF | buildPacket throws an error |
| All-0xFF data payload | Works correctly (CRC math handles it) |
| Extra bytes after a packet | parsePacket ignores them, StreamBuffer processes them as next packet |

---

## Tests Summary

15+ tests organized into 10 groups:

1. Round-trip tests for all 6 commands (build, parse, interpret)
2. CRC failure detection (flipped CRC, corrupted data)
3. Truncated/incomplete input (empty, 1-byte, mid-data)
4. Invalid headers (wrong bytes, swapped bytes)
5. Edge cases (zero-length, unknown commands, boundary values)
6. Concatenated packets in StreamBuffer
7. Fragmented packets (byte-by-byte and split-in-half)
8. Garbage byte recovery
9. Direction detection (0xAB55 vs 0xAC55)
10. Listener subscribe/unsubscribe

Run with `cd core-1 && npm test`.

---

## Tech Stack

| Part | Tech |
|------|------|
| Protocol Parser | TypeScript, Node.js |
| Tests | Jest + ts-jest |
| Simulator | React 18, Vite 5 |
| Bonus | TypeScript (no ML dependencies) |
| Styling | Plain CSS |
| Fonts | Space Grotesk + Space Mono |

---

## Bonus Feature

See [bonus/DESIGN.md](bonus/DESIGN.md) for the design document.

I picked Option B (Voice Intent Classifier) - classify text into capture/exit/wake/chat/none across English, Hindi, and Telugu. Built it entirely client-side with no ML model, just keyword matching with fuzzy search. Gets 85% accuracy on the test set. More details in the design doc.

---

Built for the GlassLink G1 internship assignment. All protocol logic, tests, and UI code are in this repo.
