import { ParsedPacket, ParseError, ParseErrorType, StreamEvent, MIN_PACKET_SIZE } from './types';
import { parsePacketDetailed } from './parser';

// handles fragmented and concatenated BLE packets
// keeps an internal buffer, emits events when complete packets are found
export class StreamBuffer {
  private buffer: Uint8Array = new Uint8Array(0);
  private listeners: Array<(event: StreamEvent) => void> = [];

  public parsedCount = 0;
  public errorCount = 0;

  // feed raw bytes from a BLE notification
  push(chunk: Uint8Array): void {
    this.buffer = concat(this.buffer, chunk);
    this.drain();
  }

  onEvent(cb: (event: StreamEvent) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
    this.parsedCount = 0;
    this.errorCount = 0;
  }

  get pending(): number {
    return this.buffer.length;
  }

  // keep extracting packets until we can't anymore
  private drain(): void {
    let safety = 1000; // prevent infinite loop on weird input

    while (this.buffer.length >= MIN_PACKET_SIZE && safety-- > 0) {
      const headerIdx = this.findHeader();

      if (headerIdx === -1) {
        // no valid header anywhere - dump the buffer
        this.emit({
          type: 'error',
          error: {
            type: ParseErrorType.INVALID_HEADER,
            message: `no valid header in ${this.buffer.length} bytes, discarding`,
            partialData: new Uint8Array(this.buffer),
          },
          timestamp: Date.now(),
        });
        this.errorCount++;
        this.buffer = new Uint8Array(0);
        return;
      }

      // skip over any garbage before the header
      if (headerIdx > 0) {
        this.emit({
          type: 'error',
          error: {
            type: ParseErrorType.INVALID_HEADER,
            message: `skipped ${headerIdx} garbage bytes`,
            partialData: new Uint8Array(this.buffer.slice(0, headerIdx)),
          },
          timestamp: Date.now(),
        });
        this.errorCount++;
        this.buffer = this.buffer.slice(headerIdx);
      }

      if (this.buffer.length < 4) return; // need at least header + length

      const lengthField = (this.buffer[2] << 8) | this.buffer[3];
      const totalSize = 4 + lengthField;

      if (lengthField < 2) {
        // bad length, skip past this header
        this.emit({
          type: 'error',
          error: { type: ParseErrorType.INVALID_LENGTH, message: `bad length: ${lengthField}` },
          timestamp: Date.now(),
        });
        this.errorCount++;
        this.buffer = this.buffer.slice(2);
        continue;
      }

      // not enough bytes yet - wait for more
      if (this.buffer.length < totalSize) return;

      // try to parse
      const slice = this.buffer.slice(0, totalSize);
      const result = parsePacketDetailed(new Uint8Array(slice));

      if (result.success) {
        this.emit({ type: 'packet', packet: result.packet, timestamp: Date.now() });
        this.parsedCount++;
      } else {
        this.emit({ type: 'error', error: result.error, timestamp: Date.now() });
        this.errorCount++;
      }

      this.buffer = this.buffer.slice(totalSize);
    }
  }

  // scan for 0xAB55 or 0xAC55
  private findHeader(): number {
    for (let i = 0; i <= this.buffer.length - 2; i++) {
      if (this.buffer[i + 1] === 0x55 && (this.buffer[i] === 0xab || this.buffer[i] === 0xac)) {
        return i;
      }
    }
    return -1;
  }

  private emit(event: StreamEvent): void {
    for (const cb of this.listeners) cb(event);
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
