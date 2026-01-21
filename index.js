import {
  createPublicClient,
  createWalletClient,
  extractChain,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration, filecoin } from 'viem/chains'
import { auctionInfo, auctionFunds } from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'
import { payments } from '@filoz/synapse-core/abis'

/**
 * @typedef {Object} Clients
 * @property {import('viem').PublicClient} publicClient
 * @property {import('viem').WalletClient} walletClient
 * @property {import('viem').Account} account
 */

/**
 * @param {314 | 314159} chainId
 * @param {string} rpcUrl
 * @param {string} privateKey
 * @returns {Promise<Clients>}
 */
export async function createClient(chainId, rpcUrl, privateKey) {
  const chain = extractChain({
    chains: [filecoin, filecoinCalibration],
    id: chainId,
  })
  const account = privateKeyToAccount(/** @type {`0x${string}`} */ (privateKey))

  const publicClient = createPublicClient({
    chain: filecoinCalibration,
    transport: http(rpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  })

  return { publicClient, walletClient, account }
}

/**
 * @param {string} rpcUrl
 * @returns {Promise<314 | 314159>}
 */
export async function getChainId(rpcUrl) {
  const tempClient = createPublicClient({
    transport: http(rpcUrl),
  })

  return /** @type {314 | 314159} */ (await tempClient.getChainId())
}

/**
 * @param {import('viem').PublicClient} publicClient
 * @param {string} address
 * @returns {Promise<bigint>}
 */
export async function getBalance(publicClient, address) {
  return await publicClient.getBalance({
    address: /** @type {`0x${string}`} */ (address),
  })
}

/**
 * @typedef {Object} Auction
 * @property {`0x${string}`} token
 * @property {bigint} startPrice
 * @property {bigint} startTime
 * @property {bigint} availableFees
 */

/**
 * @param {import('viem').PublicClient} publicClient
 * @param {string} tokenAddress
 * @returns {Promise<Auction | null>}
 */
export async function getActiveAuction(publicClient, tokenAddress) {
  const auction = await auctionInfo(
    /** @type {any} */ (publicClient),
    /** @type {`0x${string}`} */ (tokenAddress),
  )

  if (auction.startTime === 0n) {
    return null
  }

  const availableFees = await auctionFunds(
    /** @type {any} */ (publicClient),
    /** @type {`0x${string}`} */ (tokenAddress),
  )

  return {
    ...auction,
    availableFees,
  }
}

/**
 * @param {object} args
 * @param {import('viem').WalletClient} args.walletClient
 * @param {import('viem').PublicClient} args.publicClient
 * @param {import('viem').Account} args.account
 * @param {`0x${string}`} args.tokenAddress
 * @param {`0x${string}`} args.recipient
 * @param {bigint} args.amount
 * @param {bigint} args.price
 * @returns {Promise<import('viem').TransactionReceipt>}
 */
export async function placeBid({
  walletClient,
  publicClient,
  account,
  tokenAddress,
  recipient,
  amount,
  price,
}) {
  const chain = getChain(walletClient?.chain?.id)
  const contractAddress = chain.contracts.payments.address

  const { request } = await publicClient.simulateContract({
    account,
    address: contractAddress,
    abi: payments,
    functionName: 'burnForFees',
    args: [tokenAddress, recipient, amount],
    value: price,
  })

  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  return receipt
}

/**
 * @param {number} chainId
 * @returns {`0x${string}`}
 */
export function getUsdfcAddress(chainId) {
  switch (chainId) {
    case 314:
      return '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045' // mainnet
    case 314159:
      return '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0' // calibration
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`)
  }
}
