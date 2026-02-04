import { auctionPriceAt } from '@filoz/synapse-core/auction'
import { RouteStatus } from 'sushi/evm'
import { getActiveAuction as defaultGetActiveAuction } from './auction.js'
import {
  getSwapQuote as defaultGetSwapQuote,
  SUSHISWAP_NATIVE_PLACEHOLDER,
} from './swap.js'

/** @import {StatsConfig} from "./stats-config.js" */

/**
 * Dummy sender address for swap quotes (any valid address works with simulate:
 * false)
 */
const DUMMY_SENDER = /** @type {import('viem').Address} */ (
  '0x0000000000000000000000000000000000000001'
)

/**
 * Collect auction stats and update Prometheus gauges
 *
 * @param {StatsConfig} config
 * @param {object} [options]
 * @param {typeof defaultGetActiveAuction} [options.getActiveAuction]
 * @param {typeof defaultGetSwapQuote} [options.getSwapQuote]
 * @returns {Promise<void>}
 */
export async function collectAndUpdateStats(
  config,
  {
    getActiveAuction = defaultGetActiveAuction,
    getSwapQuote = defaultGetSwapQuote,
  } = {},
) {
  const {
    publicClient,
    poolBalanceGauge,
    auctionPriceGauge,
    swapAmountOutGauge,
    usdfcAddress,
    usdfcAddressMainnet,
    network,
  } = config

  const labels = { network, token: 'USDFC' }

  const auction = await getActiveAuction(publicClient, usdfcAddress)

  if (!auction) {
    poolBalanceGauge.set(labels, 0)
    auctionPriceGauge.set(labels, 0)
    swapAmountOutGauge.set(labels, 0)
    console.log('No active auction - recorded zeros')
    return
  }

  const block = await publicClient.getBlock()
  const auctionPrice = auctionPriceAt(auction, block.timestamp)

  const swapQuote = await getSwapQuote({
    tokenIn: usdfcAddressMainnet,
    tokenOut: SUSHISWAP_NATIVE_PLACEHOLDER,
    amount: auction.availableFees,
    sender: DUMMY_SENDER,
  })

  const swapAmountOut =
    swapQuote?.status === RouteStatus.Success
      ? BigInt(swapQuote.assumedAmountOut)
      : 0n

  poolBalanceGauge.set(labels, Number(auction.availableFees))
  auctionPriceGauge.set(labels, Number(auctionPrice))
  swapAmountOutGauge.set(labels, Number(swapAmountOut))

  console.log(`Stats recorded:`)
  console.log(`  Pool balance: ${auction.availableFees}`)
  console.log(`  Auction price: ${auctionPrice} attoFIL`)
  console.log(`  Swap amount out: ${swapAmountOut} attoFIL`)
}
