import { erc20Abi } from 'viem'
import {
  KNOWN_TOKENS,
  CHAIN_ID_MAINNET,
  CHAIN_ID_CALIBRATION,
} from './constants.js'
import { getChain } from '@filoz/synapse-core/chains'

/**
 * Log transaction receipt details
 *
 * @param {string} label
 * @param {import('viem').TransactionReceipt} receipt
 */
export function logReceipt(label, receipt) {
  console.log()
  console.log(`${label}:`)
  console.log(`  Transaction hash: ${receipt.transactionHash}`)
  console.log(`  Block number: ${receipt.blockNumber}`)
  console.log(`  Gas used: ${receipt.gasUsed}`)
  console.log(
    `  Status: ${receipt.status === 'success' ? 'success' : 'failed'}`,
  )
}

/**
 * Get block explorer URL for a transaction
 *
 * @param {number} chainId
 * @param {string} hash
 * @returns {string}
 */
export function getTxUrl(chainId, hash) {
  const prefix = chainId === CHAIN_ID_CALIBRATION ? 'calibration.' : ''
  return `https://${prefix}filfox.info/en/tx/${hash}`
}

/**
 * @param {bigint} timestamp
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const elapsed = now - timestamp
  if (elapsed < 60n) return `${elapsed}s ago`
  if (elapsed < 3600n) return `${elapsed / 60n}m ago`
  if (elapsed < 86400n) return `${elapsed / 3600n}h ago`
  return `${elapsed / 86400n}d ago`
}

/**
 * @param {number} chainId
 * @returns {import('viem').Address}
 */
export function getPaymentsContract(chainId) {
  const chain = getChain(chainId)
  return /** @type {import('viem').Address} */ (
    chain.contracts.payments.address
  )
}

/**
 * @param {string} network
 * @returns {{ chainId: 314 | 314159; networkName: string }}
 */
export function resolveNetwork(network) {
  const normalized = network.trim().toLowerCase()
  if (normalized === 'mainnet') {
    return { chainId: CHAIN_ID_MAINNET, networkName: 'Mainnet' }
  }
  return { chainId: CHAIN_ID_CALIBRATION, networkName: 'Calibration' }
}

/**
 * Get token symbol dynamically or from known tokens
 *
 * @param {import('viem').PublicClient} publicClient
 * @param {import('viem').Address} address
 * @returns {Promise<string>}
 */
export async function getTokenSymbol(publicClient, address) {
  if (KNOWN_TOKENS[address]) {
    return KNOWN_TOKENS[address]
  }

  try {
    const symbol = await publicClient.readContract({
      address,
      abi: erc20Abi,
      functionName: 'symbol',
    })
    return symbol
  } catch (e) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }
}
