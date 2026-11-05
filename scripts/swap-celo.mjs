// If the owner funds the agent wallet with native CELO (exchanges withdraw CELO on the Celo network,
// stablecoins rarely), swap it to USDT through the Uniswap v3 CELO/USDT 0.01% pool, keeping a little
// CELO for gas. Exported for mainnet-go.mjs; prints a JSON line when run directly.
import { parseAbi, erc20Abi } from 'viem';
import { agentAccount, publicClient, walletClient } from '../src/wallet.js';
import { NETWORKS } from '../src/config.js';

const CELO_TOKEN = '0x471EcE3750Da237f93B8E339c536989b8978a438'; // native CELO is also ERC-20 (GoldToken)
const ROUTER = '0x5615CDAb10dc425a742d643d949a7F474C01abc4';     // Uniswap SwapRouter02 on Celo
const QUOTER = '0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8';     // Uniswap QuoterV2 on Celo
const FEE = 100;
const KEEP = 50000000000000000n;   // 0.05 CELO left for gas
const MIN_IN = 300000000000000000n; // swap only when at least 0.3 CELO arrived

const quoterAbi = parseAbi(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)']);
const routerAbi = parseAbi(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)']);

export async function swapCeloIfFunded() {
  const n = NETWORKS.celo, pc = publicClient(n), wc = walletClient(n), me = agentAccount().address;
  const bal = await pc.getBalance({ address: me });
  if (bal < MIN_IN) return { swapped: false, celo: bal.toString() };
  const amountIn = bal - KEEP;
  const usdt = n.tokens.USDT;
  const { result } = await pc.simulateContract({ address: QUOTER, abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn: CELO_TOKEN, tokenOut: usdt, amountIn, fee: FEE, sqrtPriceLimitX96: 0n }], account: me });
  const minOut = (result[0] * 97n) / 100n;
  const allowance = await pc.readContract({ address: CELO_TOKEN, abi: erc20Abi, functionName: 'allowance', args: [me, ROUTER] });
  let approveTx = null;
  if (allowance < amountIn) {
    approveTx = await wc.writeContract({ address: CELO_TOKEN, abi: erc20Abi, functionName: 'approve', args: [ROUTER, amountIn] });
    await pc.waitForTransactionReceipt({ hash: approveTx });
  }
  const swapTx = await wc.writeContract({ address: ROUTER, abi: routerAbi, functionName: 'exactInputSingle', args: [{ tokenIn: CELO_TOKEN, tokenOut: usdt, fee: FEE, recipient: me, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] });
  const rc = await pc.waitForTransactionReceipt({ hash: swapTx });
  return { swapped: rc.status === 'success', approveTx, swapTx, amountIn: amountIn.toString(), quotedUsdt: result[0].toString() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.env.REPLAYCHECK_NETWORK = 'celo';
  console.log(JSON.stringify(await swapCeloIfFunded()));
}
