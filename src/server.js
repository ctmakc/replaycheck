// ReplayCheck as a paid service. This process is the upstream behind `buy gate paywall.yml`:
// the gate answers 402, verifies and settles the caller's USDC payment to the agent wallet,
// then forwards the request here. Each run in turn buys its browser sessions and inference
// from the buy gateway, so one customer payment fans out into paid calls to other services.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { runTask } from './runner.js';
import { writeReport } from './report.js';
import { receipts } from './pay.js';
import { agentAccount } from './wallet.js';
import { network, ATTRIBUTION_CODE } from './config.js';

const PORT = Number(process.env.PORT || 8742);
const PUBLIC_BASE = process.env.REPLAYCHECK_PUBLIC_BASE || `http://127.0.0.1:${PORT}`;
const MAX_TASKS = 3, MAX_STEPS = 12;
// Free demo runs (Celo Sepolia only): one at a time, at most DEMO_PER_HOUR per hour.
const DEMO_PER_HOUR = Number(process.env.REPLAYCHECK_DEMO_PER_HOUR || 30);
let demoBusy = false; const demoTimes = [];
const STATIC = { '/': ['public/index.html', 'text/html; charset=utf-8'], '/logo.png': ['public/logo.png', 'image/png'], '/mmix-logo.png': ['public/mmix-logo.png', 'image/png'], '/demo.mp4': ['public/demo.mp4', 'video/mp4'] };

async function readBody(req) { let raw = ''; for await (const c of req) { raw += c; if (raw.length > 64 * 1024) break; } return raw; }

async function replay(body, payer) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 8);
  const outDir = join('reports', 'runs', runId);
  mkdirSync(outDir, { recursive: true });
  const before = receipts.length;
  const results = [];
  for (const t of body.tasks) results.push(await runTask(t, outDir));
  const runReceipts = receipts.slice(before);
  writeReport(outDir, { runId, network: network().slug, agent: agentAccount().address, agentId: process.env.REPLAYCHECK_AGENT_ID || null, attributionCode: ATTRIBUTION_CODE, payer, results, receipts: runReceipts });
  return {
    runId,
    network: network().slug,
    report: `${PUBLIC_BASE}/${outDir}/index.html`,
    reportBase: `${PUBLIC_BASE}/${outDir}`,
    passed: results.filter((r) => r.status === 'pass').length,
    total: results.length,
    results: results.map((r) => ({ id: r.id, name: r.name, status: r.status, error: r.error || null, checks: r.checks, screenshots: r.screenshots, final: r.final })),
    upstreamPaidCalls: runReceipts.map((r) => ({ provider: r.provider, capability: r.capability, usd: r.usd, txHash: r.txHash, explorer: r.explorer })),
  };
}

function validate(body) {
  const tasks = body?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > MAX_TASKS) return `tasks must be an array of 1..${MAX_TASKS}`;
  for (const [i, t] of tasks.entries()) {
    if (typeof t.startUrl !== 'string' || !/^https:\/\//.test(t.startUrl)) return `tasks[${i}].startUrl must be https`;
    if (!Array.isArray(t.steps) || t.steps.length > MAX_STEPS) return `tasks[${i}].steps must be an array of at most ${MAX_STEPS}`;
    if (!Array.isArray(t.expect) || t.expect.length === 0 || t.expect.length > 4) return `tasks[${i}].expect must have 1..4 checks`;
    t.id = String(t.id || `task-${i + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || `task-${i + 1}`;
    t.name = String(t.name || t.id).slice(0, 200);
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/v1/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, agent: agentAccount().address, network: network().slug, agentId: process.env.REPLAYCHECK_AGENT_ID || null, attributionCode: ATTRIBUTION_CODE }));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/reports/')) {
    const p = normalize(url.pathname).replace(/^\/+/, '');
    if (!p.startsWith('reports/') || !existsSync(p)) { res.writeHead(404); return res.end(); }
    const type = p.endsWith('.png') ? 'image/png' : p.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'content-type': type }); return res.end(readFileSync(p));
  }
  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [f, type] = STATIC[url.pathname];
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }); return res.end(readFileSync(f));
  }
  if (req.method === 'POST' && (url.pathname === '/v1/replay' || url.pathname === '/demo/run')) {
    const demo = url.pathname === '/demo/run';
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (demo) {
      if (network().slug !== 'celo-sepolia') return send(403, { error: 'free demo runs only on the Celo Sepolia instance; use POST /v1/replay with x402' });
      const now = Date.now(); while (demoTimes.length && now - demoTimes[0] > 3600e3) demoTimes.shift();
      if (demoTimes.length >= DEMO_PER_HOUR) return send(429, { error: 'demo limit reached for this hour, try again later or pay per run over x402' });
      if (demoBusy) return send(429, { error: 'another demo run is in progress, try again in a minute' });
    }
    let body; try { body = JSON.parse(await readBody(req)); } catch { return send(400, { error: 'invalid json' }); }
    const err = validate(body);
    if (err) return send(400, { error: err });
    if (demo) { if (body.tasks.length > 1) return send(400, { error: 'demo runs take one task' }); demoBusy = true; demoTimes.push(Date.now()); }
    try { return send(200, await replay(body, demo ? 'demo' : (req.headers['x-payer'] || null))); }
    catch (e) { return send(500, { error: e.message }); }
    finally { if (demo) demoBusy = false; }
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not found"}');
});
server.listen(PORT, '127.0.0.1', () => console.error(`[replaycheck] upstream on 127.0.0.1:${PORT} (${network().slug})`));
