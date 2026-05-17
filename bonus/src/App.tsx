import { useState, useMemo } from 'react';
import { classify, EXAMPLES, type ClassificationResult, type Intent } from './classifier';

/* ================================================================== */
/*  Root                                                               */
/* ================================================================== */

export default function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ClassificationResult | null>(null);

  const run = () => {
    if (!input.trim()) return;
    setResult(classify(input));
  };

  const tryExample = (text: string) => {
    setInput(text);
    setResult(classify(text));
  };

  /* ---- accuracy sweep ---- */
  const acc = useMemo(() => {
    const rows = EXAMPLES.map(ex => {
      const r = classify(ex.text);
      return { ...ex, actual: r.intent, pass: r.intent === ex.expectedIntent, conf: r.confidence };
    });
    const ok = rows.filter(r => r.pass).length;
    return { rows, ok, total: EXAMPLES.length, pct: Math.round((ok / EXAMPLES.length) * 100) };
  }, []);

  return (
    <div className="app-shell">
      {/* ======== HEADER ======== */}
      <header className="top-bar">
        <div className="top-bar__brand">
          <span className="top-bar__icon">🎙</span>
          <div>
            <div className="top-bar__title">Voice Intent Classifier</div>
            <div className="top-bar__sub">GlassLink G1 · NLP Engine v1.0</div>
          </div>
        </div>
        <div className="lang-chips">
          <span className="lang-chip lang-chip--en">EN</span>
          <span className="lang-chip lang-chip--hi">HI</span>
          <span className="lang-chip lang-chip--te">TE</span>
        </div>
      </header>

      {/* ======== INPUT ======== */}
      <div className="card">
        <div className="card__head">
          <span className="card__head-dot" />
          Voice Input
        </div>
        <div className="card__body">
          <div className="input-row">
            <input
              id="voice-input"
              className="text-field"
              type="text"
              placeholder={'Try: "Take a photo", "फोटो खींचो", "ఫోటో తీయి"...'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()}
            />
            <button id="btn-classify" className="classify-btn" onClick={run}>
              Classify
            </button>
          </div>
        </div>
      </div>

      {/* ======== RESULT ======== */}
      {result && (
        <div className="card" key={result.processingTimeMs + input}>
          <div className="card__head">
            <span className="card__head-dot" style={{ background: intentColor(result.intent) }} />
            Classification Result
          </div>
          <div className="result">
            <div className={`result__intent intent-${result.intent}`}>
              {intentIcon(result.intent)} {result.intent}
            </div>

            <div className="meta-grid">
              <MetaBox label="Confidence" value={`${(result.confidence * 100).toFixed(0)}%`} />
              <MetaBox label="Language" value={result.language} />
              <MetaBox label="Latency" value={`${result.processingTimeMs}ms`} />
              <MetaBox label="Tokens" value={String(result.tokens.length)} />
            </div>

            <div className="scores">
              {(['capture', 'exit', 'wake', 'chat'] as Intent[]).map(intent => (
                <div className="score-row" key={intent}>
                  <span className="score-row__label">{intent}</span>
                  <div className="score-row__track">
                    <div
                      className={`score-row__fill fill--${intent}`}
                      style={{ width: `${(result.scores[intent] ?? 0) * 100}%` }}
                    />
                  </div>
                  <span className="score-row__pct">
                    {((result.scores[intent] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======== EXAMPLES ======== */}
      <div className="card">
        <div className="card__head">
          <span className="card__head-dot" style={{ background: 'var(--amber)' }} />
          Quick Test · Example Phrases
        </div>
        <div className="examples-grid">
          {EXAMPLES.slice(0, 12).map((ex, i) => (
            <button key={i} className="ex-btn" onClick={() => tryExample(ex.text)}>
              <span className="ex-btn__text">{ex.text}</span>
              <span className="ex-btn__meta">{ex.lang} · {ex.expectedIntent}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ======== ACCURACY TABLE ======== */}
      <div className="card">
        <div className="accuracy-head">
          <span className="accuracy-head__title">Accuracy Benchmark</span>
          <span
            className="accuracy-head__score"
            style={{ color: acc.pct >= 80 ? 'var(--green)' : 'var(--amber)' }}
          >
            {acc.ok}/{acc.total} ({acc.pct}%)
          </span>
        </div>
        <div className="tbl-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th>Input</th>
                <th>Language</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {acc.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.text}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                    {r.lang}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.expectedIntent}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.actual}</td>
                  <td>
                    <span
                      className="conf-bar"
                      style={{ width: `${Math.max(4, r.conf * 60)}px` }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {(r.conf * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.pass ? 'badge--pass' : 'badge--fail'}`}>
                      {r.pass ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Small helpers                                                     */
/* ================================================================== */

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-box">
      <div className="meta-box__label">{label}</div>
      <div className="meta-box__val">{value}</div>
    </div>
  );
}

function intentIcon(i: Intent): string {
  return { capture: '◎', exit: '⏻', wake: '△', chat: '◈', none: '—' }[i];
}

function intentColor(i: Intent): string {
  return {
    capture: 'var(--blue)', exit: 'var(--red)', wake: 'var(--green)',
    chat: 'var(--purple)', none: 'var(--text-faint)',
  }[i];
}
