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
  if (req.method === 'POST' && url.pathname === '/v1/replay') {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 64 * 1024) break; }
    let body; try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end('{"error":"invalid json"}'); }
    const err = validate(body);
    if (err) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: err })); }
    const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 8);
    const outDir = join('reports', 'runs', runId);
    mkdirSync(outDir, { recursive: true });
    const before = receipts.length;
    const results = [];
    for (const t of body.tasks) results.push(await runTask(t, outDir));
    const runReceipts = receipts.slice(before);
    const payer = req.headers['x-payer'] || null; // set by the gate when it forwards a settled payment
    writeReport(outDir, { runId, network: network().slug, agent: agentAccount().address, agentId: process.env.REPLAYCHECK_AGENT_ID || null, attributionCode: ATTRIBUTION_CODE, payer, results, receipts: runReceipts });
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      runId,
      report: `${PUBLIC_BASE}/${outDir}/index.html`,
      passed: results.filter((r) => r.status === 'pass').length,
      total: results.length,
      results: results.map((r) => ({ id: r.id, status: r.status, error: r.error || null, checks: r.checks })),
      upstreamPaidCalls: runReceipts.map((r) => ({ provider: r.provider, capability: r.capability, usd: r.usd, txHash: r.txHash })),
    }));
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not found"}');
});
server.listen(PORT, '127.0.0.1', () => console.error(`[replaycheck] upstream on 127.0.0.1:${PORT} (${network().slug})`));
