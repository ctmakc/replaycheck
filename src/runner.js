// Replays recorded user tasks in rented browsers and checks the outcome.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RentedBrowser, pickDuration } from './browser.js';
import { judge } from './judge.js';
import { network } from './config.js';

const STEP_ACTIONS = new Set(['open', 'click', 'fill', 'type', 'press', 'check', 'uncheck', 'hover', 'focus', 'scroll', 'wait', 'back', 'forward', 'reload']);

async function pageText(b) {
  try { const out = await b.cmd({ action: 'get', kind: 'text', target: 'body' }); return typeof out === 'string' ? out : out?.data?.text ?? out?.text ?? ''; }
  catch { return ''; }
}
async function getKind(b, kind) {
  try { const out = await b.cmd({ action: 'get', kind }); return typeof out === 'string' ? out : out?.data?.[kind] ?? out?.[kind] ?? ''; } catch { return ''; }
}
async function shot(b, dir, name) {
  try {
    const out = await b.cmd({ action: 'screenshot' });
    if (out?.base64) { const f = join(dir, name); writeFileSync(f, Buffer.from(out.base64, 'base64')); return name; }
  } catch {}
  return null;
}

export async function runTask(task, outDir) {
  const dir = join(outDir, task.id);
  mkdirSync(dir, { recursive: true });
  const result = { id: task.id, name: task.name, startUrl: task.startUrl, steps: [], checks: [], screenshots: [], status: 'error', startedAt: new Date().toISOString() };
  let b;
  try {
    const minutes = task.durationMinutes || pickDuration(task.steps.length + (task.expect?.length || 0));
    b = await RentedBrowser.rent(minutes, `browser ${minutes}m · ${task.id}`);
    result.sessionId = b.sessionId;
    await b.cmd({ action: 'open', url: task.startUrl });
    result.steps.push({ action: 'open', url: task.startUrl, ok: true });
    let i = 0;
    for (const step of task.steps) {
      i++;
      if (!STEP_ACTIONS.has(step.action)) { result.steps.push({ ...step, ok: false, error: 'unsupported action' }); continue; }
      try {
        await b.cmd(step);
        result.steps.push({ ...step, ok: true });
      } catch (e) {
        result.steps.push({ ...step, ok: false, error: e.message });
        const s = await shot(b, dir, `step-${i}-failed.png`); if (s) result.screenshots.push(s);
        if (!step.optional) throw Object.assign(new Error(`step ${i} (${step.action} ${step.target || step.url || ''}) failed: ${e.message}`), { stepFailure: true });
      }
    }
    const final = await shot(b, dir, 'final.png'); if (final) result.screenshots.push(final);
    const text = await pageText(b);
    const url = await getKind(b, 'url');
    const title = await getKind(b, 'title');
    result.final = { url, title };
    for (const ex of task.expect || []) {
      let c;
      if (ex.textContains) c = { type: 'textContains', value: ex.textContains, pass: text.toLowerCase().includes(ex.textContains.toLowerCase()) };
      else if (ex.urlContains) c = { type: 'urlContains', value: ex.urlContains, pass: String(url).includes(ex.urlContains) };
      else if (ex.titleContains) c = { type: 'titleContains', value: ex.titleContains, pass: String(title).toLowerCase().includes(ex.titleContains.toLowerCase()) };
      else if (ex.judge && network().slug === 'celo-sepolia') {
        // Cencori inference is sold on Celo mainnet only; on the sandbox fall back to the task's literal check.
        const lit = ex.fallbackTextContains;
        c = { type: 'judge (sandbox fallback)', value: ex.judge, pass: lit ? text.toLowerCase().includes(lit.toLowerCase()) : false, reason: lit ? `sandbox: checked literal text "${lit}" instead of paid inference` : 'sandbox: no paid inference on testnet' };
      }
      else if (ex.judge) { const j = await judge({ expectation: ex.judge, pageText: text, url, title }); c = { type: 'judge', value: ex.judge, pass: j.pass, reason: j.reason }; }
      else c = { type: 'unknown', value: JSON.stringify(ex), pass: false };
      result.checks.push(c);
    }
    result.status = result.checks.every((c) => c.pass) ? 'pass' : 'fail';
  } catch (e) {
    result.status = e.stepFailure ? 'fail' : 'error';
    result.error = e.message;
  } finally {
    if (b) await b.close();
    result.finishedAt = new Date().toISOString();
  }
  return result;
}
