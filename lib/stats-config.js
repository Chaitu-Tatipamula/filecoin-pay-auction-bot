import { Registry, Gauge } from 'prom-client'
import { createPublicClient, extractChain, http } from 'viem'
import { filecoin, filecoinCalibration } from 'viem/chains'
import { getChainId } from './client.js'
import { getUsdfcAddress } from './config.js'
import { ChainId } from 'sushi'

/**
 * @import {
 *   Address,
 *   PublicClient
 * } from "viem"
 */

/**
 * @typedef {Object} StatsConfig
 * @property {PublicClient} publicClient
 * @property {Registry} registry
 * @property {Gauge} poolBalanceGauge
 * @property {Gauge} auctionPriceGauge
 * @property {Gauge} swapAmountOutGauge
 * @property {Address} usdfcAddress
 * @property {Address} usdfcAddressMainnet
 * @property {314 | 314159} chainId
 * @property {string} network
 * @property {number} interval
 * @property {number} metricsPort
 */

/**
 * Initialize stats reporter configuration
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<StatsConfig>}
 */
export async function initializeStatsConfig(env = {}) {
  const {
    RPC_URL = 'https://api.calibration.node.glif.io/',
    STATS_INTERVAL = '60000',
    METRICS_PORT = '9090',
  } = env

  const chainId = await getChainId(RPC_URL)
  const usdfcAddress = getUsdfcAddress(chainId)
  const usdfcAddressMainnet = getUsdfcAddress(ChainId.FILECOIN)
  const isMainnet = chainId === 314
  const network = isMainnet ? 'mainnet' : 'calibration'
  const metricsPort = Number(METRICS_PORT)

  console.log('Initializing auction stats reporter...')
  console.log(`RPC URL: ${RPC_URL}`)
  console.log(`Network: ${network}`)
  console.log(`Monitoring token: USDFC at ${usdfcAddress}`)
  console.log(`Metrics port: ${metricsPort}`)
  console.log(`Report interval: ${STATS_INTERVAL}ms`)
  console.log()

  const chain = extractChain({
    chains: [filecoin, filecoinCalibration],
    id: chainId,
  })

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
  })

  const registry = new Registry()

  const poolBalanceGauge = new Gauge({
    name: 'auction_pool_balance',
    help: 'Available fees in the auction pool',
    labelNames: ['network', 'token'],
    registers: [registry],
  })

  const auctionPriceGauge = new Gauge({
    name: 'auction_price',
    help: 'Current auction price (attoFIL)',
    labelNames: ['network', 'token'],
    registers: [registry],
  })

  const swapAmountOutGauge = new Gauge({
    name: 'auction_swap_amount_out',
    help: 'Estimated swap output for available fees (attoFIL)',
    labelNames: ['network', 'token'],
    registers: [registry],
  })

  console.log('Initialization complete.')

  return {
    publicClient,
    registry,
    poolBalanceGauge,
    auctionPriceGauge,
    swapAmountOutGauge,
    usdfcAddress,
    usdfcAddressMainnet,
    chainId,
    network,
    interval: Number(STATS_INTERVAL),
    metricsPort,
  }
}
