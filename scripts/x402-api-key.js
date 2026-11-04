#!/usr/bin/env node
// Creates the seller API key at the Celo x402 facilitator (x402.celo.org) by signing its
// nonce message with the agent wallet. Costs no gas. Prints the key once; store it as
// X402_API_KEY in your secrets file, never in the repo.
import { agentAccount } from '../src/wallet.js';
const base = 'https://x402.celo.org';
const acct = agentAccount();
const { nonce } = await (await fetch(`${base}/api/keys/nonce`)).json();
const message = `x402.celo.org wants you to create an x402 API key.\n\nAddress: ${acct.address}\nNonce: ${nonce}\n\nSigning this message proves you control this wallet. It costs no gas and sends no transaction.`;
const signature = await acct.signMessage({ message });
const r = await fetch(`${base}/api/keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: acct.address, nonce, signature }) });
const j = await r.json();
if (!r.ok) { console.error(JSON.stringify(j)); process.exit(1); }
const { apiKey, ...rest } = j;
console.log(`X402_API_KEY=${apiKey}`);
console.error(JSON.stringify(rest));
