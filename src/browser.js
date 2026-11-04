// A rented browser from the buy gateway (provider: buy-browser-worker), paid per session over x402.
import { paidJson } from './pay.js';
import { GATEWAY } from './config.js';

const DURATIONS = [1, 2, 3, 5, 10];

export function pickDuration(steps) {
  // ~10 s per step plus page loads, rounded up to the next sold duration.
  const minutes = Math.max(1, Math.ceil((steps * 10 + 20) / 60));
  return DURATIONS.find((d) => d >= minutes) || 10;
}

export class RentedBrowser {
  static async rent(durationMinutes, label) {
    const res = await paidJson(`${GATEWAY}/v1/browser/sessions`, { durationMinutes }, { label: label || `browser ${durationMinutes}m` });
    const b = res.browser || res;
    if (!b.commandUrl || !b.accessToken) throw new Error('gateway answered without a browser session: ' + JSON.stringify(res).slice(0, 300));
    const rb = new RentedBrowser(b);
    await rb.waitReady();
    return rb;
  }

  constructor(b) { this.info = b; this.sessionId = b.sessionId; }

  async waitReady(timeoutMs = 60000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = await this.status();
      if (s.status === 'ready' || s.browser?.status === 'ready') return;
      if (['failed', 'terminated', 'expired'].includes(s.status || s.browser?.status)) throw new Error('browser session ' + (s.status || s.browser?.status));
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async status() {
    const r = await fetch(this.info.statusUrl, { headers: { authorization: `Bearer ${this.info.accessToken}` } });
    try { return await r.json(); } catch { return {}; }
  }

  async cmd(command) {
    const r = await fetch(this.info.commandUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.info.accessToken}` },
      body: JSON.stringify(command),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(`${command.action}: HTTP ${r.status} ${j.error?.code || j.error || ''} ${j.error?.message || j.message || ''}`.trim());
      e.code = j.error?.code || j.error; throw e;
    }
    return j.output;
  }

  async close() {
    try { await fetch(this.info.statusUrl, { method: 'DELETE', headers: { authorization: `Bearer ${this.info.accessToken}` } }); } catch {}
  }
}
