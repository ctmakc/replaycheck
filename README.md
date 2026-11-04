# ReplayCheck

ReplayCheck replays the flows your users depend on (sign-up, sign-in, checkout, an assistant chat) in a real browser after every release or model change, and tells you which ones broke, with screenshots.

It is an agent with its own Celo wallet and ERC-8004 identity. It owns no browser fleet and no model. For every run it **buys** what it needs over x402 on Celo through [buy](https://usebuy.ai):

| What ReplayCheck buys | From | Price (live catalog, Nov 2026) |
|---|---|---|
| An isolated Chrome session, 1 to 10 minutes | buy gateway, provider `buy-browser-worker` | $0.0036 to $0.0091 per session |
| A judgement call when a check is written in plain language | Cencori `maximo-atlas-1.3` via the buy gateway | $0.01 per call |

And it **sells** each replay run over x402: `POST /v1/replay` costs 0.05 USDC, paid to the agent wallet and settled by Celo's x402 facilitator. One customer payment turns into two or three paid calls to services ReplayCheck does not control.

Built for the Loops House × Celo **Agents on Open Rails** hackathon, track **Build with buy**.

**Live:** https://replaycheck.mmix.biz (free sandbox runs from the page) · **Demo video:** https://replaycheck.mmix.biz/demo.mp4 (87 s)

## Why

Small teams that ship AI features change prompts, models and UI every week. A change that looks fine in review can break sign-in or checkout, and they hear about it from users. A test fleet on a monthly contract is too much overhead for a two-person team. ReplayCheck charges per run, a few cents, and needs nothing installed on the customer side.

## How a run works

```
customer ──x402 0.05 USDC──▶ buy gate (paywall.yml) ──▶ ReplayCheck upstream (src/server.js)
                                                            │
                                   ┌────────────────────────┴──────────────────────┐
                                   ▼                                               ▼
                    x402 ▶ gateway.usebuy.ai/v1/browser/sessions     x402 ▶ gateway.usebuy.ai/cencori/...
                    open · fill · click · wait · screenshot          "does this page show what the user expects?"
                                   └────────────────────────┬──────────────────────┘
                                                            ▼
                                  report: pass/fail per task, screenshots, every settlement tx
```

A task is plain JSON (see `tasks/demo.json`):

```json
{
  "id": "login-ok",
  "name": "Sign in with valid credentials reaches the secure area",
  "startUrl": "https://the-internet.herokuapp.com/login",
  "steps": [
    { "action": "fill", "target": "#username", "text": "tomsmith" },
    { "action": "fill", "target": "#password", "text": "SuperSecretPassword!" },
    { "action": "click", "target": "button[type=submit]" },
    { "action": "wait", "target": "#flash" }
  ],
  "expect": [
    { "urlContains": "/secure" },
    { "textContains": "You logged into a secure area" },
    { "judge": "The page greets a signed-in user and offers a way to log out." }
  ]
}
```

Steps use the buy browser command set: `open`, `fill`, `type`, `click`, `press`, `check`, `hover`, `scroll`, `wait`, `back`, `reload`. Checks are literal (`textContains`, `urlContains`, `titleContains`) or a plain-language `judge`, which buys one inference call.

## Onchain pieces

- **Agent wallet:** `0x7Fd33c597ACd183c3AD9006C1FE8e337609cFCd3`, a key made for this agent only.
- **ERC-8004 identity:** `npm run register` calls `register(agentURI)` on the IdentityRegistry (`0x8004A169…a432` on Celo mainnet, `0x8004A818…BD9e` on Celo Sepolia). The agent URI is `agent-registration.json` in this repo.
- **ERC-8021 attribution:** the wallet client is built with `withAttribution([...])` from `@celo/attribution-tags`, so every transaction the agent sends carries the tag. The suffix holds the code the Loops House entry issued, `celo_17ee521cbfea`, plus the repo-derived `celo_2784cb800c0a`. `npm run register` decodes the suffix from its own transaction and reports whether the issued code is present.
- **Gas in stablecoins:** transactions set a CIP-64 `feeCurrency` (USDC adapter), so the wallet holds USDC only and never needs CELO. x402 settlements are gasless for the payer.
- **Spending guards:** each paid call is capped (`REPLAYCHECK_MAX_CALL_ATOMIC`, default $0.02) and each process has a budget (`REPLAYCHECK_MAX_RUN_ATOMIC`, default $0.50). A paid call that fails with 5xx is never retried automatically, since the payment may already have settled.

## Proof so far (Celo Sepolia, buy gateway sandbox)

| Step | Transaction |
|---|---|
| ERC-8004 `register` from the agent wallet, gas paid in USDC, tag decoded on-chain (repo code; this run predates the issued code), agentId 927 | [0x94b1dd8b…e40c](https://celo-sepolia.blockscout.com/tx/0x94b1dd8b96dcfd412753bf996d3715888c0b9906a52f2314b668c99cb413e40c) |
| ReplayCheck buys a 2-minute browser session (`login-ok`) | [0x89f10873…1945](https://celo-sepolia.blockscout.com/tx/0x89f108735207dfd1808c9d1b4395c8dd65c0bb8a10bdaf5a5912aebdbe101945) |
| ReplayCheck buys a 2-minute browser session (`login-regression`) | [0x5a353b08…92af](https://celo-sepolia.blockscout.com/tx/0x5a353b08655c2f031220e4826bbfe1e4f2f3da6829f984387be2eb226dc592af) |
| A separate customer wallet pays ReplayCheck 0.05 USDC for a run through `buy gate` + Celo x402 facilitator | [0xaa3f4a95…0ddb](https://celo-sepolia.blockscout.com/tx/0xaa3f4a95f1a4bbd96d5d410c0f2714a07f87d47f45fc088dc0549569d0720ddb) |
| …and ReplayCheck spends part of it on a browser session for that run | [0x9aec5800…273a](https://celo-sepolia.blockscout.com/tx/0x9aec580063c6a0668e820e5d8de36e68cd3d79157ee3dc77cc4d62629e6d273a) |

The hackathon counts Celo mainnet only. The same code runs on mainnet with `REPLAYCHECK_NETWORK=celo`; mainnet transactions are listed in `docs/MAINNET.md` as they happen.

## Run it

Node 22+.

```sh
npm install
cp .env.example .env            # put a fresh agent key in REPLAYCHECK_AGENT_PRIVATE_KEY
set -a; . ./.env; set +a

# free: the buy gateway sandbox funds the wallet with 1 test USDC a day
REPLAYCHECK_NETWORK=celo-sepolia npm run demo
REPLAYCHECK_NETWORK=celo-sepolia npm run register

# real: fund the agent wallet with a few USDC on Celo mainnet first
REPLAYCHECK_NETWORK=celo npm run register
REPLAYCHECK_NETWORK=celo npm run demo
```

The report lands in `reports/<run>/index.html` with screenshots and a table of every paid call and its settlement transaction.

### Sell runs

```sh
npm run x402-key                 # one-time: API key from x402.celo.org, signed by the agent wallet (no gas)
npm run serve &                  # upstream on 127.0.0.1:8742
BUY_FACILITATOR_API_KEY=x402_... npm run gate   # x402 paywall on :4402, 0.05 USDC per run
```

A customer then pays and runs their own tasks with any x402 client, for example:

```sh
npx @celo/buy curl --max-amount 0.06 -X POST -H 'content-type: application/json' \
  --data-file my-tasks.json https://<your host>/v1/replay
```

Limits per run: up to 3 tasks, 12 steps and 4 checks per task, https start URLs only.

## Layout

```
bin/replaycheck.js        CLI: run, whoami
src/pay.js                x402 payments via @celo/buy-core payingFetch: caps, budget, receipts
src/browser.js            rented browser sessions from the buy gateway
src/judge.js              plain-language checks via Cencori on the buy gateway
src/runner.js             replays one task, collects screenshots and checks
src/report.js             HTML + JSON report with settlement links
src/server.js             paid upstream for buy gate
scripts/register-agent.js ERC-8004 registration, stablecoin gas, attribution tag verified from the tx
scripts/x402-api-key.js   seller key from the Celo x402 facilitator
paywall.yml               buy gate config (mainnet); paywall.sandbox.yml for Celo Sepolia
agent-registration.json   ERC-8004 agent registration file
```

## Team

INNOVA CONSULT LTD. (Ottawa, Canada). Maksym Stepanenko, director; web delivery and IT/AI consulting.

## License

MIT
