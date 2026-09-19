// ── Browser Notification API + vibration + chime ────────────────────
// Fires real OS-level notifications for order lifecycle events while
// the site's tab is open (even backgrounded). Graceful no-op everywhere
// if the API is missing or permission was denied.

let audioCtx: AudioContext | null = null;

function playNotifyChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const notes = [880, 1174.66]; // A5 → D6, short two-note chime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch {
    // Audio unavailable — notification still shows silently
  }
}

// Request permission once (called when a user logs in). If the user
// denies it, everything below simply no-ops.
export function requestNotifyPermission() {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // ignore
  }
}

export function fireBrowserNotification(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, icon: '/favicon.svg' });
    n.onclick = () => {
      try { window.focus(); n.close(); } catch { /* ignore */ }
    };
    // Short vibration where supported (mobile)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
    }
    playNotifyChime();
  } catch {
    // ignore — in-app bell notifications still work regardless
  }
}
