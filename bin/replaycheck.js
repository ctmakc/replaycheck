#!/usr/bin/env node
// replaycheck run <tasks.json> [--out reports/<id>]   replay tasks, write HTML+JSON report with receipts
// replaycheck whoami                                   agent address, balances, attribution code
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runTask } from '../src/runner.js';
import { writeReport } from '../src/report.js';
import { receipts, spentAtomic } from '../src/pay.js';
import { agentAccount, balances } from '../src/wallet.js';
import { network, ATTRIBUTION_CODE } from '../src/config.js';

const [cmd, file, ...rest] = process.argv.slice(2);
const arg = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };

if (cmd === 'whoami') {
  const a = agentAccount().address;
  console.log(JSON.stringify({ network: network().slug, agent: a, attributionCode: ATTRIBUTION_CODE, agentId: process.env.REPLAYCHECK_AGENT_ID || null, balances: await balances(a) }, null, 2));
} else if (cmd === 'run' && file) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const tasks = spec.tasks || spec;
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = arg('--out') || join('reports', runId);
  mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const t of tasks) {
    console.error(`[replaycheck] ${t.id}: ${t.name}`);
    const r = await runTask(t, outDir);
    console.error(`[replaycheck] ${t.id}: ${r.status}${r.error ? ' — ' + r.error : ''}`);
    results.push(r);
  }
  const run = { runId, network: network().slug, agent: agentAccount().address, agentId: process.env.REPLAYCHECK_AGENT_ID || null, attributionCode: ATTRIBUTION_CODE, results, receipts, spentAtomic: spentAtomic().toString() };
  const html = writeReport(outDir, run);
  console.log(JSON.stringify({ report: html, passed: results.filter((r) => r.status === 'pass').length, total: results.length, spentUsd: Number(spentAtomic()) / 1e6, receipts: receipts.map((r) => r.txHash) }, null, 2));
  process.exit(results.every((r) => r.status === 'pass') ? 0 : 1);
} else {
  console.error('usage: replaycheck run <tasks.json> [--out dir] | replaycheck whoami');
  process.exit(2);
}
