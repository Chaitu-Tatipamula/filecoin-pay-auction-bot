import { Point } from '@influxdata/influxdb-client'
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
 * Collect auction stats and write to InfluxDB
 *
 * @param {StatsConfig} config
 * @param {object} [options]
 * @param {typeof defaultGetActiveAuction} [options.getActiveAuction]
 * @param {typeof defaultGetSwapQuote} [options.getSwapQuote]
 * @returns {Promise<void>}
 */
export async function collectAndReportStats(
  config,
  {
    getActiveAuction = defaultGetActiveAuction,
    getSwapQuote = defaultGetSwapQuote,
  } = {},
) {
  const { publicClient, writeApi, usdfcAddress, usdfcAddressMainnet, network } =
    config

  const auction = await getActiveAuction(publicClient, usdfcAddress)

  if (!auction) {
    const point = new Point('auction_stats')
      .tag('network', network)
      .tag('token', 'USDFC')
      .stringField('pool_balance', '0')
      .stringField('auction_price', '0')
      .stringField('swap_amount_out', '0')
      .floatField('profitability_ratio', 0)

    writeApi.writePoint(point)
    await writeApi.flush()
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

  const point = new Point('auction_stats')
    .tag('network', network)
    .tag('token', 'USDFC')
    .stringField('pool_balance', auction.availableFees.toString())
    .stringField('auction_price', auctionPrice.toString())
    .stringField('swap_amount_out', swapAmountOut.toString())

  writeApi.writePoint(point)
  await writeApi.flush()

  console.log(`Stats recorded:`)
  console.log(`  Pool balance: ${auction.availableFees} wei`)
  console.log(`  Auction price: ${auctionPrice} wei`)
  console.log(`  Swap amount out: ${swapAmountOut} wei`)
}
