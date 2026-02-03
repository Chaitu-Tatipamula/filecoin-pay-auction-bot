import { InfluxDB } from '@influxdata/influxdb-client'
import { createPublicClient, extractChain, http } from 'viem'
import { filecoin, filecoinCalibration } from 'viem/chains'
import { getChainId } from './client.js'
import { getUsdfcAddress } from './config.js'
import { ChainId } from 'sushi'

/**
 * @import {WriteApi} from "@influxdata/influxdb-client"
 * @import {
 *   Address,
 *   PublicClient
 * } from "viem"
 */

/**
 * @typedef {Object} StatsConfig
 * @property {PublicClient} publicClient
 * @property {WriteApi} writeApi
 * @property {Address} usdfcAddress
 * @property {Address} usdfcAddressMainnet
 * @property {314 | 314159} chainId
 * @property {string} network
 * @property {number} interval
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
    INFLUXDB_URL,
    INFLUXDB_TOKEN,
    INFLUXDB_ORG,
    INFLUXDB_BUCKET,
    STATS_INTERVAL = '60000',
  } = env

  if (!INFLUXDB_URL) {
    throw new Error('INFLUXDB_URL environment variable is required')
  }
  if (!INFLUXDB_TOKEN) {
    throw new Error('INFLUXDB_TOKEN environment variable is required')
  }
  if (!INFLUXDB_ORG) {
    throw new Error('INFLUXDB_ORG environment variable is required')
  }
  if (!INFLUXDB_BUCKET) {
    throw new Error('INFLUXDB_BUCKET environment variable is required')
  }

  const chainId = await getChainId(RPC_URL)
  const usdfcAddress = getUsdfcAddress(chainId)
  const usdfcAddressMainnet = getUsdfcAddress(ChainId.FILECOIN)
  const isMainnet = chainId === 314
  const network = isMainnet ? 'mainnet' : 'calibration'

  console.log('Initializing auction stats reporter...')
  console.log(`RPC URL: ${RPC_URL}`)
  console.log(`Network: ${network}`)
  console.log(`Monitoring token: USDFC at ${usdfcAddress}`)
  console.log(`InfluxDB URL: ${INFLUXDB_URL}`)
  console.log(`InfluxDB Bucket: ${INFLUXDB_BUCKET}`)
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

  const influxDB = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN })
  const writeApi = influxDB.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET)

  console.log('Initialization complete.')

  return {
    publicClient,
    writeApi,
    usdfcAddress,
    usdfcAddressMainnet,
    chainId,
    network,
    interval: Number(STATS_INTERVAL),
  }
}
