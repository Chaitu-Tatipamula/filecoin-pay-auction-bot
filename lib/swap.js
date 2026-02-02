import { ChainId } from 'sushi'
import { getSwap, RouteStatus } from 'sushi/evm'
/**
 * @import {
 *   Account,
 *   Address,
 *   PublicClient,
 *   TransactionReceipt,
 *   WalletClient
 * } from "viem"
 */

export const SUSHISWAP_NATIVE_PLACEHOLDER =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

/**
 * Get a swap quote from Sushiswap (without balance validation)
 *
 * @param {object} args
 * @param {Address} args.tokenIn - Input token address
 * @param {Address} args.tokenOut - Output token address
 * @param {bigint} args.amount - Amount to swap
 * @param {Address} args.sender - Sender address
 * @returns {Promise<import('sushi/evm').SwapResponse<false> | null>}
 */
export async function getSwapQuote({ tokenIn, tokenOut, amount, sender }) {
  if (amount === 0n) {
    return null
  }

  try {
    // Use simulate: false to skip balance validation on API
    // (tokens will come from pending burnForFees transaction)
    return await getSwap({
      chainId: ChainId.FILECOIN,
      tokenIn,
      tokenOut,
      amount,
      sender,
      maxSlippage: 0.005,
      simulate: false,
    })
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.log(`Failed to get Sushiswap swap quote: ${err.message}`)
    return null
  }
}

/**
 * Discover Sushiswap router address by making a small quote request
 *
 * @param {Address} tokenIn - Input token address (USDFC)
 * @param {Address} sender - Sender address
 * @returns {Promise<Address | null>}
 */
export async function discoverSushiswapRouter(tokenIn, sender) {
  console.log('Discovering Sushiswap router address...')

  const quote = await getSwapQuote({
    tokenIn,
    tokenOut: /** @type {Address} */ (SUSHISWAP_NATIVE_PLACEHOLDER),
    amount: 1000000n, // 1 USDFC (6 decimals)
    sender,
  })

  if (
    !quote ||
    (quote.status !== RouteStatus.Success &&
      quote.status !== RouteStatus.Partial)
  ) {
    console.log('Could not discover Sushiswap router address.')
    return null
  }

  const routerAddress = /** @type {Address} */ (quote.tx.to)
  console.log(`Sushiswap router address: ${routerAddress}`)
  return routerAddress
}

/**
 * Execute a swap using the transaction data from Sushiswap
 *
 * @param {object} args
 * @param {PublicClient} args.publicClient
 * @param {WalletClient} args.walletClient
 * @param {Account} args.account
 * @param {{ to: Address; data: `0x${string}`; value: bigint }} args.swapTx -
 *   Transaction data from getSwapQuote
 * @param {number} [args.nonce] - Optional nonce override
 * @returns {Promise<TransactionReceipt>}
 */
export async function executeSwap({
  publicClient,
  walletClient,
  account,
  swapTx,
  nonce,
}) {
  console.log('Executing swap...')

  // @ts-expect-error - chain is inferred from walletClient
  const hash = await walletClient.sendTransaction({
    account,
    to: swapTx.to,
    data: swapTx.data,
    value: swapTx.value,
    nonce,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return receipt
}
