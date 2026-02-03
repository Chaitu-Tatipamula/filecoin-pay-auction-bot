import { ChainId } from 'sushi'
import { getSwap } from 'sushi/evm'
/** @import {Address} from "viem" */

export const SUSHISWAP_NATIVE_PLACEHOLDER = /** @type {Address} */ (
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
)

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
 * Discovers Sushiswap router address by making a quote request
 *
 * @param {object} args
 * @param {number} args.chainId - Chain ID (only Filecoin mainnet 314 supported)
 * @param {Address} args.tokenIn - Input token address (USDFC)
 * @param {Address} args.sender - Sender address
 * @returns {Promise<Address | null>}
 */
export async function discoverSushiswapRouter({ chainId, tokenIn, sender }) {
  if (chainId !== ChainId.FILECOIN) {
    return null
  }

  console.log('Discovering Sushiswap router address...')

  const quote = await getSwapQuote({
    tokenIn,
    tokenOut: SUSHISWAP_NATIVE_PLACEHOLDER,
    amount: 1000000000000000000n, // 1 USDFC (18 decimals)
    sender,
  })

  if (!quote || !('tx' in quote)) {
    console.log('Could not discover Sushiswap router address.')
    return null
  }

  const routerAddress = quote.tx.to
  console.log(`Sushiswap router address: ${routerAddress}`)
  return routerAddress
}
