#!/usr/bin/env node
// Registers the ReplayCheck agent in the ERC-8004 IdentityRegistry from the agent wallet.
// Gas is paid in a stablecoin (CIP-64 feeCurrency), so the wallet needs no CELO.
// The transaction carries the ERC-8021 attribution suffix (withAttribution on the wallet client).
import { parseAbi, parseEventLogs } from 'viem';
import { fromDataSuffix } from '@celo/attribution-tags';
import { network, ATTRIBUTION_CODES, ASSIGNED_CODE, REPO } from '../src/config.js';
import { walletClient, publicClient, agentAccount, balances } from '../src/wallet.js';

const abi = parseAbi([
  'function register(string agentURI) returns (uint256)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const n = network();
const me = agentAccount().address;
const agentURI = process.env.REPLAYCHECK_AGENT_URI || `https://raw.githubusercontent.com/${REPO}/main/agent-registration.json`;
const bal = await balances(me, n);
// Pay gas in whichever stablecoin the wallet holds (CIP-64); fall back to CELO if it holds CELO only.
let feeToken = process.env.REPLAYCHECK_FEE_TOKEN;
if (!feeToken) feeToken = Object.keys(n.feeCurrencies).find((t) => BigInt(bal[t] || '0') > 20000n) || (BigInt(bal.CELO) > 0n ? 'CELO' : 'USDC');
const feeCurrency = n.feeCurrencies[feeToken];

const pc = publicClient(n);
const already = await pc.readContract({ address: n.identityRegistry, abi, functionName: 'balanceOf', args: [me] });
if (already > 0n && !process.argv.includes('--again')) {
  console.log(JSON.stringify({ note: 'agent wallet already owns an ERC-8004 identity on this network; pass --again to mint another', network: n.slug, owner: me, count: already.toString() }));
  process.exit(0);
}
console.error(`[register] ${n.slug} registry ${n.identityRegistry} owner ${me} uri ${agentURI} fee ${feeToken} ${feeCurrency} tags ${ATTRIBUTION_CODES.join(',')}`);
console.error('[register] balances', JSON.stringify(bal));

const wc = walletClient(n);
const hash = await wc.writeContract({ address: n.identityRegistry, abi, functionName: 'register', args: [agentURI], ...(feeCurrency ? { feeCurrency } : {}) });
const rcpt = await pc.waitForTransactionReceipt({ hash });
const tx = await pc.getTransaction({ hash });
const ev = parseEventLogs({ abi, logs: rcpt.logs, eventName: 'Registered' })[0];
const tag = fromDataSuffix(tx.input);
console.log(JSON.stringify({
  network: n.slug,
  status: rcpt.status,
  txHash: hash,
  explorer: `${n.explorer}/tx/${hash}`,
  agentId: ev?.args?.agentId?.toString(),
  agentRegistry: `eip155:${n.chainId}:${n.identityRegistry}`,
  owner: me,
  agentURI,
  attributionOnChain: tag,
  assignedCodePresent: !!tag?.codes?.includes(ASSIGNED_CODE),
  gasUsed: rcpt.gasUsed.toString(),
  feeCurrency: feeCurrency || 'CELO',
}, null, 2));
