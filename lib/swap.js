import { ChainId } from 'sushi'
import { getSwap } from 'sushi/evm'
/** @import {Address} from "viem" */

export const SUSHISWAP_NATIVE_PLACEHOLDER = /** @type {Address} */ (
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
)

/**
 * @typedef {object} QuoteResponse
 * @property {'Success' | 'Partial' | 'NoWay'} status
 * @property {string} assumedAmountOut
 * @property {string} gasSpent
 */

/**
 * Get a swap quote from Sushiswap using HTTP API
 *
 * TODO: Replace with Sushiswap SDK once
 * https://github.com/sushi-labs/sushi/pull/427 is merged and released
 *
 * @param {object} args
 * @param {Address} args.tokenIn - Input token address
 * @param {Address} args.tokenOut - Output token address
 * @param {bigint} args.amount - Amount to swap
 * @returns {Promise<QuoteResponse>}
 */
export async function getQuote({ tokenIn, tokenOut, amount }) {
  if (amount === 0n) {
    throw new Error('Cannot get quote for zero amount')
  }

  const url = new URL(`https://api.sushi.com/quote/v7/${ChainId.FILECOIN}`)
  url.searchParams.set('tokenIn', tokenIn)
  url.searchParams.set('tokenOut', tokenOut)
  url.searchParams.set('amount', amount.toString())
  url.searchParams.set('maxSlippage', '0.005')

  const response = await fetch(url)
  return /** @type {Promise<QuoteResponse>} */ (response.json())
}

/**
 * Discovers Sushiswap router address by making a swap request
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

  const swap = await getSwap({
    chainId: ChainId.FILECOIN,
    tokenIn,
    tokenOut: SUSHISWAP_NATIVE_PLACEHOLDER,
    amount: 1000000000000000000n, // 1 USDFC (18 decimals)
    sender,
    maxSlippage: 0.005,
    simulate: false,
  })

  return swap.status === 'NoWay' ? null : swap.tx.to
}
