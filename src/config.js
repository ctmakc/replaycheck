// ReplayCheck network configuration. Mainnet is the default; set REPLAYCHECK_NETWORK=celo-sepolia
// to run the whole flow on Celo Sepolia with the buy gateway sandbox (test USDC, no value).
import { codeFromRepo } from '@celo/attribution-tags';

export const REPO = process.env.REPLAYCHECK_REPO || 'ctmakc/replaycheck';
// ERC-8021 attribution. The Loops House entry issued celo_17ee521cbfea; it must be in every
// mainnet transaction. The repo-derived code rides along in the same suffix (ERC-8021 carries
// several codes), so both the hackathon leaderboard and our own analytics see the activity.
export const ASSIGNED_CODE = process.env.REPLAYCHECK_ATTRIBUTION_CODE || 'celo_17ee521cbfea';
export const REPO_CODE = codeFromRepo(REPO);
export const ATTRIBUTION_CODES = [...new Set([ASSIGNED_CODE, REPO_CODE])];
export const ATTRIBUTION_CODE = ASSIGNED_CODE;

export const GATEWAY = process.env.REPLAYCHECK_GATEWAY || 'https://gateway.usebuy.ai';

export const NETWORKS = {
  celo: {
    slug: 'celo',
    chainId: 42220,
    rpc: process.env.CELO_RPC || 'https://forno.celo.org',
    explorer: 'https://celoscan.io',
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
    // CIP-64 fee currencies: gas can be paid in a stablecoin, so the agent wallet needs no CELO.
    feeCurrencies: {
      USDC: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B', // adapter for USDC 0xcebA...118C
      USDT: '0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72',
      USAT: '0x0357EE22278c922e1D36cFe6b899269b161880C4', // listed in FeeCurrencyDirectory as USAT
    },
    tokens: {
      USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      USDT: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
      USAT: '0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771',
    },
  },
  'celo-sepolia': {
    slug: 'celo-sepolia',
    chainId: 11142220,
    rpc: process.env.CELO_SEPOLIA_RPC || 'https://forno.celo-sepolia.celo-testnet.org',
    explorer: 'https://celo-sepolia.blockscout.com',
    identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
    feeCurrencies: {
      USDC: '0xbf1441Ea57f43f35f713431001f35742c88071c7', // adapter for sandbox USDC 0x01C5...C44E
    },
    tokens: {
      USDC: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
    },
  },
};

export function network() {
  const slug = process.env.REPLAYCHECK_NETWORK || 'celo';
  const n = NETWORKS[slug];
  if (!n) throw new Error(`unknown REPLAYCHECK_NETWORK ${slug}`);
  return n;
}

// Spending guard: the most a single paid call may cost, in atomic units (6 decimals).
export const MAX_CALL_ATOMIC = BigInt(process.env.REPLAYCHECK_MAX_CALL_ATOMIC || '20000'); // $0.02
// Daily budget for one runner process, atomic units.
export const MAX_RUN_ATOMIC = BigInt(process.env.REPLAYCHECK_MAX_RUN_ATOMIC || '500000'); // $0.50
