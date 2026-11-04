// Paid HTTP calls over x402 on Celo. Every call is capped, budgeted, and recorded as a receipt
// (amount, token, settlement tx hash) so a run report can prove what was bought and from whom.
import { x402, getTokenBalance } from '@celo/buy-core';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { agentAccount } from './wallet.js';
import { network, MAX_CALL_ATOMIC, MAX_RUN_ATOMIC } from './config.js';

const { payingFetch, fundSandboxIfShort } = x402;

let spent = 0n;
export const receipts = [];
const RECEIPTS_FILE = process.env.REPLAYCHECK_RECEIPTS || 'reports/receipts.jsonl';

export function spentAtomic() { return spent; }

export async function paidFetch(url, init = {}, { label = '', maxAmount = MAX_CALL_ATOMIC } = {}) {
  const n = network();
  const account = agentAccount();
  let challenged;
  const response = await payingFetch({
    account,
    network: n.slug,
    preferredToken: process.env.REPLAYCHECK_TOKEN || 'USDC',
    readBalance: getTokenBalance,
    topUp: n.slug === 'celo-sepolia'
      ? async (info) => {
          const r = await fundSandboxIfShort({ url: info.url, address: info.owner, network: info.network, asset: info.asset, required: info.required, read: getTokenBalance });
          if (r?.requested) console.error(`[replaycheck] sandbox faucet: ${r.result?.status}${r.result?.txHash ? ' tx ' + r.result.txHash : ''}`);
          return undefined;
        }
      : undefined,
  }, url, {
    ...init,
    maxAmount,
    onChallenge: (req) => { challenged = req; },
    onBeforePayment: (req) => {
      const amt = BigInt(req.maxAmountRequired);
      if (spent + amt > MAX_RUN_ATOMIC) throw new Error(`run budget exceeded: ${spent + amt} > ${MAX_RUN_ATOMIC} atomic`);
      spent += amt;
    },
    onPayment: (info) => {
      const rec = {
        label,
        url: info.url,
        network: info.network,
        asset: info.asset,
        amount: info.amount,
        usd: Number(info.amount) / 1e6,
        txHash: info.txHash || null,
        explorer: info.txHash ? `${network().explorer}/tx/${info.txHash}` : null,
        outcome: info.outcome,
        status: info.status,
        payer: info.authorization.from,
        payTo: challenged?.payTo,
        capability: challenged?.extra?.gateway?.capability,
        provider: challenged?.extra?.gateway?.provider,
        at: info.timestamp,
      };
      receipts.push(rec);
      try { mkdirSync(dirname(RECEIPTS_FILE), { recursive: true }); appendFileSync(RECEIPTS_FILE, JSON.stringify(rec) + '\n'); } catch {}
    },
  });
  return response;
}

export async function paidJson(url, body, opts) {
  const res = await paidFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  }, opts);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`paid call ${url} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status; err.body = json; err.paidMaybe = res.status >= 500;
    throw err;
  }
  return json;
}
