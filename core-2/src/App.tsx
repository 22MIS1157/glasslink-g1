import { useState, useCallback, useRef, useEffect } from 'react';
import {
  buildPacket, parsePacket, interpretPacket, corruptPacket,
  Command, LEDBrightness, PhotoMode, ChargingState,
  type LogEntry, type PacketDirection,
} from './protocol';

/* ================================================================== */
/*  State types                                                        */
/* ================================================================== */

interface GlassState {
  battery: number;
  charging: boolean;
  led: 'off' | 'low' | 'medium' | 'high';
  worn: boolean;
  lastPhotoTime: string | null;
}

const INIT_STATE: GlassState = {
  battery: 82,
  charging: false,
  led: 'off',
  worn: true,
  lastPhotoTime: null,
};

let _logId = 0;

/* ================================================================== */
/*  Root App                                                           */
/* ================================================================== */

export default function App() {
  const [log, setLog]       = useState<LogEntry[]>([]);
  const [chaos, setChaos]   = useState(false);
  const [glass, setGlass]   = useState<GlassState>(INIT_STATE);
  const scrollRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  /* ---- core send function ---- */
  const send = useCallback(
    (cmd: number, data: Uint8Array, dir: PacketDirection) => {
      let raw = buildPacket(cmd, data, dir);
      let corrupted = false;
      let errMsg: string | undefined;

      if (chaos && Math.random() < 0.1) {
        const c = corruptPacket(raw);
        raw = c.data;
        corrupted = true;
        errMsg = c.method;
      }

      const parsed = parsePacket(raw);
      const entry: LogEntry = {
        id: ++_logId,
        timestamp: new Date(),
        direction: dir,
        raw,
        parsed,
        interpretation: parsed
          ? interpretPacket(parsed)
          : `Parse failed (${corrupted ? 'corrupted' : 'invalid'})`,
        error: parsed ? undefined : (errMsg ?? 'parse error'),
        corrupted,
      };

      setLog(prev => [...prev, entry]);

      if (parsed) updateState(parsed.command, parsed.data, dir);
      return parsed;
    },
    [chaos],
  );

  const updateState = (cmd: number, data: Uint8Array, dir: PacketDirection) => {
    setGlass(prev => {
      const s = { ...prev };
      switch (cmd) {
        case Command.SET_LED_BRIGHTNESS: {
          const map: Record<number, GlassState['led']> = {
            [LEDBrightness.LOW]: 'low', [LEDBrightness.MEDIUM]: 'medium', [LEDBrightness.HIGH]: 'high',
          };
          if (data.length > 0) s.led = map[data[0]] ?? 'off';
          break;
        }
        case Command.CHARGING_STATUS:
          if (data.length >= 2) { s.charging = data[0] === ChargingState.CHARGING; s.battery = Math.min(100, data[1]); }
          break;
        case Command.GET_BATTERY:
          if (dir === 'device_to_app' && data.length >= 2) { s.battery = Math.min(100, data[0]); s.charging = data[1] === 1; }
          break;
        case Command.TAKE_PHOTO:
          s.lastPhotoTime = new Date().toLocaleTimeString('en-GB');
          break;
      }
      return s;
    });
  };

  return (
    <div className="lab-container">
      {/* ======== TOP BAR ======== */}
      <header className="lab-topbar">
        <div className="lab-brand">
          <pre className="lab-brand__ascii">{`◉─◉\n╰┬╯`}</pre>
          <div>
            <div className="lab-brand__name">GlassLink G1</div>
            <div className="lab-brand__tag">BLE Protocol Debug Lab v1.0</div>
          </div>
        </div>
        <div className="lab-status">
          <div className="status-chip status-chip--connected">
            <span className="status-chip__dot" />
            CONNECTED
          </div>
          <button
            id="chaos-toggle"
            className={`chaos-btn ${chaos ? 'active' : ''}`}
            onClick={() => setChaos(c => !c)}
          >
            <span className="chaos-indicator" />
            {chaos ? 'CHAOS ON' : 'CHAOS OFF'}
          </button>
        </div>
      </header>

      {/* ======== DEVICE + APP PANELS ======== */}
      <div className="lab-panels">
        <DevicePanel glass={glass} setGlass={setGlass} send={send} />
        <AppPanel glass={glass} send={send} />
      </div>

      {/* ======== SIGNAL FLOW INDICATOR ======== */}
      <div className="signal-flow">
        <div className="signal-flow__line" />
        <div className="signal-flow__label">PACKET STREAM</div>
        <div className="signal-flow__line" />
      </div>

      {/* ======== TERMINAL LOG ======== */}
      <TerminalLog log={log} clear={() => setLog([])} scrollRef={scrollRef} />
    </div>
  );
}

/* ================================================================== */
/*  Device Panel (Glasses side)                                       */
/* ================================================================== */

function DevicePanel({ glass, setGlass, send }: {
  glass: GlassState;
  setGlass: React.Dispatch<React.SetStateAction<GlassState>>;
  send: (c: number, d: Uint8Array, dir: PacketDirection) => any;
}) {
  const pushAction = (idx: number) => {
    const d = new Uint8Array(9);
    d[idx] = 1;
    send(Command.ACTION_SYNC, d, 'device_to_app');
  };

  const pushBattery = () => {
    const lvl = Math.max(0, glass.battery - Math.floor(Math.random() * 12));
    setGlass(g => ({ ...g, battery: lvl }));
    send(Command.GET_BATTERY, new Uint8Array([lvl, glass.charging ? 1 : 0]), 'device_to_app');
  };

  const toggleCharge = () => {
    const next = !glass.charging;
    setGlass(g => ({ ...g, charging: next }));
    send(Command.CHARGING_STATUS, new Uint8Array([next ? 1 : 0, glass.battery]), 'device_to_app');
  };

  const toggleWorn = () => {
    const d = new Uint8Array(9);
    d[8] = glass.worn ? 0 : 1;
    setGlass(g => ({ ...g, worn: !g.worn }));
    send(Command.ACTION_SYNC, d, 'device_to_app');
  };

  const batColor = glass.battery > 50 ? 'var(--green)' : glass.battery > 20 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__head-dot panel__head-dot--device" />
        DEVICE — Smart Glasses
      </div>
      <div className="panel__body">
        <div className="state-row">
          <div className="tile">
            <span className="tile__label">Battery</span>
            <span className="tile__val" style={{ color: batColor }}>{glass.battery}%</span>
          </div>
          <div className="tile">
            <span className="tile__label">Charging</span>
            <span className={`tile__val ${glass.charging ? 'tile__val--green' : ''}`}>
              {glass.charging ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="tile">
            <span className="tile__label">LED</span>
            <span className="tile__val">
              {glass.led.toUpperCase()}
              <span className={`led-dot led-dot--${glass.led === 'medium' ? 'med' : glass.led}`} />
            </span>
          </div>
          <div className="tile">
            <span className="tile__label">Worn</span>
            <span className={`tile__val ${glass.worn ? 'tile__val--green' : 'tile__val--red'}`}>
              {glass.worn ? 'YES' : 'NO'}
            </span>
          </div>
        </div>

        <div className="gauge">
          <div className="gauge__fill" style={{ width: `${glass.battery}%`, background: batColor }} />
        </div>

        <div className="sec-label">Push Device Events</div>
        <div className="actions">
          <button id="btn-photo" className="act-btn act-btn--amber" onClick={() => pushAction(0)}>
            Photo Taken
          </button>
          <button id="btn-nod" className="act-btn act-btn--green" onClick={() => pushAction(5)}>
            Nod Detected
          </button>
          <button id="btn-shake" className="act-btn act-btn--red" onClick={() => pushAction(6)}>
            Head Shake
          </button>
          <button id="btn-mic" className="act-btn act-btn--blue" onClick={() => pushAction(2)}>
            Mic Toggle
          </button>
          <button id="btn-bat" className="act-btn act-btn--green" onClick={pushBattery}>
            Battery Drain
          </button>
          <button id="btn-charge" className="act-btn act-btn--amber" onClick={toggleCharge}>
            {glass.charging ? 'Unplug' : 'Plug Charger'}
          </button>
          <button id="btn-worn" className="act-btn act-btn--purple" onClick={toggleWorn}>
            {glass.worn ? 'Remove Glasses' : 'Wear Glasses'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  App Panel (Phone side)                                            */
/* ================================================================== */

function AppPanel({ glass, send }: {
  glass: GlassState;
  send: (c: number, d: Uint8Array, dir: PacketDirection) => any;
}) {
  const [ledVal, setLedVal]     = useState<number>(LEDBrightness.MEDIUM);
  const [photoVal, setPhotoVal] = useState<number>(PhotoMode.PHOTO_ONLY);

  const setLED = () => send(Command.SET_LED_BRIGHTNESS, new Uint8Array([ledVal]), 'app_to_device');
  const takePhoto = () => send(Command.TAKE_PHOTO, new Uint8Array([photoVal]), 'app_to_device');
  const getBattery = () => send(Command.GET_BATTERY, new Uint8Array([]), 'app_to_device');

  const syncTime = () => {
    const n = new Date();
    const y = n.getFullYear();
    send(Command.SYNC_TIME, new Uint8Array([
      (y >> 8) & 0xff, y & 0xff,
      n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds(),
    ]), 'app_to_device');
  };

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__head-dot panel__head-dot--app" />
        APP — Companion Phone
      </div>
      <div className="panel__body">
        <div className="state-row">
          <div className="tile">
            <span className="tile__label">Battery</span>
            <span className="tile__val">{glass.battery}%</span>
          </div>
          <div className="tile">
            <span className="tile__label">Charging</span>
            <span className="tile__val">{glass.charging ? 'YES' : 'NO'}</span>
          </div>
          <div className="tile">
            <span className="tile__label">Last Photo</span>
            <span className="tile__val">{glass.lastPhotoTime ?? '---'}</span>
          </div>
          <div className="tile">
            <span className="tile__label">LED State</span>
            <span className="tile__val">{glass.led.toUpperCase()}</span>
          </div>
        </div>

        <div className="sec-label">Send Commands</div>

        <div className="select-row">
          <select id="sel-led" className="mono-select" value={ledVal} onChange={e => setLedVal(+e.target.value)}>
            <option value={LEDBrightness.LOW}>LED: Low</option>
            <option value={LEDBrightness.MEDIUM}>LED: Medium</option>
            <option value={LEDBrightness.HIGH}>LED: High</option>
          </select>
          <button id="btn-set-led" className="act-btn act-btn--amber" onClick={setLED}>Set LED</button>
        </div>

        <div className="select-row">
          <select id="sel-photo" className="mono-select" value={photoVal} onChange={e => setPhotoVal(+e.target.value)}>
            <option value={PhotoMode.PHOTO_ONLY}>Photo Only</option>
            <option value={PhotoMode.PHOTO_HD_UPLOAD}>Photo + HD</option>
          </select>
          <button id="btn-photo-cmd" className="act-btn act-btn--blue" onClick={takePhoto}>Capture</button>
        </div>

        <div className="actions">
          <button id="btn-get-bat" className="act-btn act-btn--green" onClick={getBattery}>Query Battery</button>
          <button id="btn-sync" className="act-btn act-btn--purple" onClick={syncTime}>Sync Clock</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Terminal Packet Log                                               */
/* ================================================================== */

function TerminalLog({ log, clear, scrollRef }: {
  log: LogEntry[];
  clear: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const total = log.length;
  const errs = log.filter(e => e.error).length;
  const corrupted = log.filter(e => e.corrupted).length;

  return (
    <div className="terminal">
      <div className="terminal__head">
        <div className="terminal__head-left">
          <div className="terminal__dots">
            <span className="terminal__dot" />
            <span className="terminal__dot" />
            <span className="terminal__dot" />
          </div>
          <span className="terminal__title">packet_monitor.log</span>
        </div>
        <button className="terminal__clear" onClick={clear}>clear</button>
      </div>

      <div className="terminal__body">
        {log.length === 0 ? (
          <div className="terminal__empty">
            <span style={{ color: 'var(--green)' }}>$</span> Waiting for BLE packets...
            <span className="terminal__cursor" />
            <br /><br />
            <span style={{ color: 'var(--text-faint)' }}>
              Click buttons on either panel to start exchanging packets.
            </span>
          </div>
        ) : (
          log.map(entry => {
            const isA2D = entry.direction === 'app_to_device';
            const isErr = !!entry.error;
            const ts = entry.timestamp.toLocaleTimeString('en-GB', {
              hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
              fractionalSecondDigits: 3,
            } as any);

            return (
              <div key={entry.id} className={`log-line ${isErr ? 'log-line--error' : ''}`}>
                <div className="log-line__main">
                  <span className={`log-line__prefix ${isErr ? 'log-line__prefix--err' : ''}`}>
                    {isErr ? '✗' : '›'}
                  </span>
                  <span className="log-line__time">{ts}</span>
                  <span className={`log-line__dir ${isA2D ? 'log-line__dir--a2d' : 'log-line__dir--d2a'}`}>
                    {isA2D ? 'TX▸' : '◂RX'}
                  </span>
                  <span className="log-line__msg">{entry.interpretation}</span>
                  {entry.corrupted && (
                    <span className="log-line__tag log-line__tag--corrupt">{entry.error}</span>
                  )}
                </div>
                <div className="log-line__hex">
                  {Array.from(entry.raw).map(b => b.toString(16).padStart(2, '0')).join(' ')}
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollRef as any} />
      </div>

      <div className="terminal__footer">
        <span>pkts<span className="terminal__stat-val terminal__stat-val--amber">{total}</span></span>
        <span>ok<span className="terminal__stat-val terminal__stat-val--green">{total - errs}</span></span>
        <span>err<span className="terminal__stat-val terminal__stat-val--red">{errs}</span></span>
        <span>corrupt<span className="terminal__stat-val terminal__stat-val--red">{corrupted}</span></span>
      </div>
    </div>
  );
}
