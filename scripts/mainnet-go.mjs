#!/usr/bin/env node
// One-shot mainnet bring-up once the agent wallet holds a stablecoin:
//   1. ERC-8004 register (gas in the stablecoin, attribution suffix verified from the tx)
//   2. one replay run of tasks/mainnet.json (paid browser sessions + Cencori judgements)
// Appends every transaction to docs/MAINNET.md. Idempotent: skips steps already recorded in state.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { agentAccount, balances } from '../src/wallet.js';
import { NETWORKS } from '../src/config.js';
import { swapCeloIfFunded } from './swap-celo.mjs';

process.env.REPLAYCHECK_NETWORK = 'celo';
const STATE = process.env.REPLAYCHECK_STATE || 'reports/mainnet-state.json';
const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const me = agentAccount().address;
let bal = await balances(me, NETWORKS.celo);
const stableOf = (b) => ['USDC', 'USDT', 'USAT'].reduce((a, t) => a + BigInt(b[t] || '0'), 0n);
if (stableOf(bal) < 200000n && BigInt(bal.CELO) > 0n) {
  const sw = await swapCeloIfFunded();
  console.error('[mainnet-go] celo swap', JSON.stringify(sw));
  if (sw.swapTx) appendFileSync('docs/MAINNET.md', `| ${new Date().toISOString().slice(0, 10)} | owner funded CELO, swapped to USDT (Uniswap v3 0.01%) | [${sw.swapTx.slice(0, 10)}…](https://celoscan.io/tx/${sw.swapTx}) |\n`);
  bal = await balances(me, NETWORKS.celo);
}
const stable = ['USDC', 'USDT', 'USAT'].reduce((a, t) => a + BigInt(bal[t] || '0'), 0n);
console.error('[mainnet-go] balances', JSON.stringify(bal));
if (stable < 200000n) {
  console.log(JSON.stringify({ funded: false, stableAtomic: stable.toString(), need: '>= 0.2 stablecoin on Celo mainnet' }));
  process.exit(3);
}
const token = ['USDC', 'USAT', 'USDT'].find((t) => BigInt(bal[t] || '0') >= 100000n);
const env = { ...process.env, REPLAYCHECK_NETWORK: 'celo', REPLAYCHECK_TOKEN: token };
const row = (what, tx) => appendFileSync('docs/MAINNET.md', `| ${new Date().toISOString().slice(0, 10)} | ${what} | [${tx.slice(0, 10)}…](https://celoscan.io/tx/${tx}) |\n`);

if (!st.agentId) {
  const out = JSON.parse(execFileSync('node', ['scripts/register-agent.js'], { env, encoding: 'utf8' }));
  if (out.txHash) {
    st.agentId = out.agentId; st.registerTx = out.txHash; st.assignedCodePresent = out.assignedCodePresent;
    row(`ERC-8004 register → agentId ${out.agentId}, gas in ${out.feeCurrency}, tags ${JSON.stringify(out.attributionOnChain?.codes)}`, out.txHash);
  }
  writeFileSync(STATE, JSON.stringify(st, null, 2));
}
if (!st.firstRun) {
  let out;
  try {
    out = execFileSync('node', ['bin/replaycheck.js', 'run', 'tasks/mainnet.json', '--out', 'reports/mainnet-1'], { env: { ...env, REPLAYCHECK_AGENT_ID: st.agentId || '' }, encoding: 'utf8' });
  } catch (e) { out = e.stdout; }
  const j = JSON.parse(out);
  st.firstRun = { report: j.report, receipts: j.receipts, spentUsd: j.spentUsd, passed: j.passed, total: j.total };
  const rep = JSON.parse(readFileSync('reports/mainnet-1/report.json', 'utf8'));
  for (const r of rep.receipts) if (r.txHash) row(`paid ${r.capability || r.provider} $${r.usd}`, r.txHash);
  writeFileSync(STATE, JSON.stringify(st, null, 2));
}
console.log(JSON.stringify({ funded: true, ...st }));
