import { Component, useEffect, useState, type ReactNode } from 'react';
import { isGpuInitFailure } from './MapView';

// ── On-screen debug banner ─────────────────────────────────────────────
// Captures runtime errors four ways so nothing fails silently:
//   1. React ErrorBoundary (render crashes)
//   2. window.onerror (uncaught exceptions / resource errors)
//   3. window 'unhandledrejection' (failed promises)
//   4. console.warn / console.error interception (explicit log calls,
//      e.g. the [MapView] style-loading instrumentation)
// Entries are also mirrored to the pre-patch console so devtools keep working.

export interface DebugEntry {
  id: number;
  time: string;
  kind: 'error' | 'warn' | 'boundary' | 'info';
  message: string;
}

let nextId = 1;
let listeners: Array<(entries: DebugEntry[]) => void> = [];
let entries: DebugEntry[] = [];
const MAX_ENTRIES = 150;

function push(kind: DebugEntry['kind'], message: string) {
  const entry: DebugEntry = {
    id: nextId++,
    time: new Date().toLocaleTimeString(),
    kind,
    message: String(message).slice(0, 800),
  };
  entries = [...entries.slice(-MAX_ENTRIES + 1), entry];
  listeners.forEach((l) => l(entries));
}

export function debugLog(kind: DebugEntry['kind'], message: string) {
  push(kind, message);
}

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? '\n' + a.stack.split('\n').slice(1, 3).join('\n') : ''}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

let patched = false;
function installGlobalHooks() {
  if (patched) return;
  patched = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  const origLog = console.log.bind(console);

  console.error = (...args: unknown[]) => {
    try { push('error', formatConsoleArgs(args)); } catch { /* noop */ }
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    try { push('warn', formatConsoleArgs(args)); } catch { /* noop */ }
    origWarn(...args);
  };
  console.log = (...args: unknown[]) => {
    try {
      const formatted = formatConsoleArgs(args);
      if (formatted.includes('[MapLibre') || formatted.includes('[MapView]')) {
        push('info', formatted);
      }
    } catch { /* noop */ }
    origLog(...args);
  };

  window.addEventListener('error', (event) => {
    const msg = event.error instanceof Error
      ? `${event.error.name}: ${event.error.message}`
      : event.message || 'Unknown window error';
    const src = event.filename ? ` @ ${event.filename.split('/').pop()}:${event.lineno}:${event.colno}` : '';
    push('error', `window.onerror: ${msg}${src}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : typeof reason === 'string' ? reason : JSON.stringify(reason ?? 'unknown');
    push('error', `unhandledrejection: ${msg}`);
  });
}

// ── ErrorBoundary ──────────────────────────────────────────────────────
interface BoundaryProps { children: ReactNode }
interface BoundaryState { crashed: string | null }

export class DebugErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: null };
  static getDerivedStateFromError(err: Error): BoundaryState {
    // Last line of defense for WebGL2-unsupported devices: if a GPU-init
    // cascade error (e.g. thrown asynchronously, escaping MapView's own
    // try/catch) reaches the top-level boundary, remember it as crashed —
    // render() below swaps in the friendly message instead of the generic
    // crash screen.
    if (isGpuInitFailure(err)) {
      return { crashed: `WEBGL_UNSUPPORTED: ${err.name}: ${err.message}` };
    }
    return { crashed: `${err.name}: ${err.message}` };
  }
  componentDidCatch(err: Error, info: { componentStack?: string }) {
    push('boundary', `ErrorBoundary: ${err.name}: ${err.message}${info?.componentStack ? '\n' + info.componentStack.split('\n').slice(0, 4).join('\n') : ''}`);
  }
  render() {
    if (this.state.crashed) {
      // Friendly fallback when a GPU-init failure escaped to the boundary.
      if (this.state.crashed.startsWith('WEBGL_UNSUPPORTED:')) {
        const detail = this.state.crashed.slice('WEBGL_UNSUPPORTED:'.length).trim();
        return (
          <div style={{ padding: 24, fontFamily: 'monospace', color: '#57534e', background: '#fafaf9', textAlign: 'center' }}>
            <h2>Map preview unavailable</h2>
            <p style={{ fontSize: 14 }}>Map preview isn&apos;t supported on this browser or device. Try a different browser, or open this on your phone.</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, opacity: 0.6, marginTop: 12 }}>{detail}</pre>
            <p style={{ fontSize: 12 }}>Details are also shown in the debug banner below.</p>
          </div>
        );
      }
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', color: '#b91c1c', background: '#fef2f2' }}>
          <h2>Something went wrong.</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.crashed}</pre>
          <p style={{ fontSize: 12 }}>Details are also shown in the debug banner below.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Banner UI ──────────────────────────────────────────────────────────
export default function DebugBanner() {
  const [items, setItems] = useState<DebugEntry[]>(entries);
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    installGlobalHooks();
    setItems([...entries]);
    const listener = (e: DebugEntry[]) => setItems([...e]);
    listeners.push(listener);
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }, []);

  if (!visible) return null;

  const copyAll = () => {
    const text = items.map((i) => `[${i.time}] [${i.kind}] ${i.message}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div
      data-testid="debug-banner"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 99999,
        background: 'rgba(10,10,12,0.94)', color: '#f5f5f5',
        borderTop: '2px solid #ef4444',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11, lineHeight: 1.5,
        maxHeight: collapsed ? 32 : 280,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: '#1c1917', flexShrink: 0 }}>
        {(() => {
          const hasError = items.some((i) => i.kind === 'error' || i.kind === 'boundary');
          const hasWarn = items.some((i) => i.kind === 'warn');
          const bg = hasError ? '#ef4444' : hasWarn ? '#f59e0b' : items.length ? '#0284c7' : '#16a34a';
          return (
            <span style={{ background: bg, color: '#fff', borderRadius: 10, padding: '0 8px', fontWeight: 700 }}>
              DEBUG {items.length ? `(${items.length})` : '(idle)'}
            </span>
          );
        })()}
        <span style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          MapLibre & Tile Lifecycle Monitor
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setCollapsed((c) => !c)} style={{ color: '#fbbf24', background: 'none', border: 'none', cursor: 'pointer' }}>
          {collapsed ? 'expand ▲' : 'collapse ▼'}
        </button>
        <button onClick={copyAll} style={{ color: '#93c5fd', background: 'none', border: 'none', cursor: 'pointer' }}>copy</button>
        <button onClick={() => { entries = []; setItems([]); }} style={{ color: '#93c5fd', background: 'none', border: 'none', cursor: 'pointer' }}>clear</button>
        <button onClick={() => setVisible(false)} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>hide ✕</button>
      </div>
      {!collapsed && (
        <>
          {(() => {
            const tileReqs = items.filter((i) => i.message.includes('[MapLibre:TileRequest')).length;
            const tileAborts = items.filter((i) => i.message.includes('[MapLibre:sourcedataabort]')).length;
            const tileLoads = items.filter((i) => i.message.includes('[state=loaded]')).length;
            const loadFired = items.some((i) => i.message.includes('[MapLibre:load]'));
            const idleFired = items.some((i) => i.message.includes('[MapLibre:idle]'));
            const webglLost = items.some((i) => i.message.includes('[MapLibre:webglcontextlost]'));

            return (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  padding: '5px 10px',
                  background: '#111015',
                  borderBottom: '1px solid #27272a',
                  fontSize: 10,
                }}
              >
                <span style={{ color: '#93c5fd' }}>
                  <strong>Tiles:</strong> {tileReqs} req | <span style={{ color: '#4ade80' }}>{tileLoads} loaded</span> |{' '}
                  <span style={{ color: tileAborts ? '#f59e0b' : '#71717a' }}>{tileAborts} aborted</span>
                </span>
                <span style={{ color: loadFired ? '#4ade80' : '#a1a1aa' }}>
                  <strong>load:</strong> {loadFired ? '✓ FIRED' : 'pending'}
                </span>
                <span style={{ color: idleFired ? '#4ade80' : '#a1a1aa' }}>
                  <strong>idle:</strong> {idleFired ? '✓ FIRED' : 'pending'}
                </span>
                {webglLost && (
                  <span style={{ color: '#ef4444', fontWeight: 700 }}>
                    ⚠️ WEBGL CONTEXT LOST
                  </span>
                )}
              </div>
            );
          })()}
          <div style={{ overflowY: 'auto', padding: '6px 10px', flex: 1 }}>
            {items.length === 0 && (
              <div style={{ opacity: 0.5 }}>
                No events logged yet. MapLibre tile requests and errors will appear here live.
              </div>
            )}
            {items.map((i) => {
              const tagColor =
                i.kind === 'warn'
                  ? '#fbbf24'
                  : i.kind === 'error' || i.kind === 'boundary'
                  ? '#f87171'
                  : '#38bdf8';
              return (
                <div
                  key={i.id}
                  style={{
                    borderBottom: '1px solid #292524',
                    padding: '3px 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  <span style={{ color: '#78716c' }}>[{i.time}]</span>{' '}
                  <span style={{ color: tagColor, fontWeight: 700 }}>[{i.kind}]</span>{' '}
                  <span>{i.message}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
