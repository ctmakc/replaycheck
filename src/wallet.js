import { createPublicClient, createWalletClient, http, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo, celoSepolia } from 'viem/chains';
import { withAttribution } from '@celo/attribution-tags';
import { network, ATTRIBUTION_CODES } from './config.js';

export function agentAccount() {
  const key = process.env.REPLAYCHECK_AGENT_PRIVATE_KEY;
  if (!key) throw new Error('REPLAYCHECK_AGENT_PRIVATE_KEY is not set (see .env.example)');
  return privateKeyToAccount(key);
}

export function chainFor(n = network()) {
  return n.slug === 'celo' ? celo : celoSepolia;
}

export function publicClient(n = network()) {
  return createPublicClient({ chain: chainFor(n), transport: http(n.rpc) });
}

// Every transaction this wallet client sends carries the ERC-8021 attribution suffix.
export function walletClient(n = network()) {
  return createWalletClient({
    account: agentAccount(),
    chain: chainFor(n),
    transport: http(n.rpc),
  }).extend(withAttribution(ATTRIBUTION_CODES));
}

export async function balances(address, n = network()) {
  const pc = publicClient(n);
  const out = { CELO: (await pc.getBalance({ address })).toString() };
  for (const [sym, token] of Object.entries(n.tokens)) {
    try {
      out[sym] = (await pc.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] })).toString();
    } catch { out[sym] = 'n/a'; }
  }
  return out;
}
