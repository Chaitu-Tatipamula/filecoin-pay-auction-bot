import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration, filecoin } from 'viem/chains'
import filecoinPayAbi from './FilecoinPayV1.abi.json'

const HALVING_INTERVAL = 302400n

/**
 * @typedef {Object} Clients
 * @property {import('viem').PublicClient} publicClient
 * @property {import('viem').WalletClient} walletClient
 * @property {import('viem').Account} account
 */

/**
 * @param {string} environment
 * @param {string} rpcUrl
 * @param {string} privateKey
 * @returns {Clients}
 */
export function createClient(environment, rpcUrl, privateKey) {
  const chain = environment === 'mainnet' ? filecoin : filecoinCalibration
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
 * @param {bigint} startPrice
 * @param {bigint} startTime
 * @returns {bigint}
 */
export function calculateCurrentPrice(startPrice, startTime) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const elapsed = now - startTime

  if (elapsed <= 0n) {
    return startPrice
  }

  const numHalvings = elapsed / HALVING_INTERVAL

  let price = startPrice
  for (let i = 0n; i < numHalvings; i++) {
    price = price / 2n
    if (price === 0n) {
      return 0n
    }
  }

  const remainder = elapsed % HALVING_INTERVAL
  if (remainder > 0n) {
    const fractionDecay = (remainder * 1000000n) / HALVING_INTERVAL
    const decayMultiplier = 1000000n - fractionDecay / 2n
    price = (price * decayMultiplier) / 1000000n
  }

  return price
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
 * @property {string} token
 * @property {bigint} startPrice
 * @property {bigint} startTime
 * @property {bigint} availableFees
 */

/**
 * @param {import('viem').PublicClient} publicClient
 * @param {string} contractAddress
 * @param {string[]} tokenAddresses
 * @returns {Promise<Auction[]>}
 */
export async function getActiveAuctions(
  publicClient,
  contractAddress,
  tokenAddresses,
) {
  const auctions = []

  for (const token of tokenAddresses) {
    const auctionInfo = await publicClient.readContract({
      address: /** @type {`0x${string}`} */ (contractAddress),
      abi: filecoinPayAbi,
      functionName: 'auctionInfo',
      args: [token],
    })

    const [startPrice, startTime] = /** @type {[bigint, bigint]} */ (
      auctionInfo
    )

    if (startTime === 0n) {
      continue
    }

    const accountInfo = await publicClient.readContract({
      address: /** @type {`0x${string}`} */ (contractAddress),
      abi: filecoinPayAbi,
      functionName: 'accounts',
      args: [token, contractAddress],
    })

    const availableFees = /** @type {[bigint, bigint, bigint, bigint]} */ (
      accountInfo
    )[0]

    auctions.push({
      token,
      startPrice,
      startTime,
      availableFees,
    })
  }

  return auctions
}

/**
 * @param {Auction[]} auctions
 * @returns {Auction | null}
 */
export function selectFirstAvailableAuction(auctions) {
  return auctions.find((auction) => auction.availableFees > 0n) || null
}

/**
 * @param {import('viem').WalletClient} walletClient
 * @param {import('viem').PublicClient} publicClient
 * @param {string} contractAddress
 * @param {string} tokenAddress
 * @param {string} recipient
 * @param {bigint} amount
 * @param {bigint} currentPrice
 * @returns {Promise<import('viem').TransactionReceipt>}
 */
export async function placeBid(
  walletClient,
  publicClient,
  contractAddress,
  tokenAddress,
  recipient,
  amount,
  currentPrice,
) {
  // @ts-expect-error - chain is inherited from walletClient
  const hash = await walletClient.writeContract({
    address: /** @type {`0x${string}`} */ (contractAddress),
    abi: filecoinPayAbi,
    functionName: 'burnForFees',
    args: [tokenAddress, recipient, amount],
    value: currentPrice,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  return receipt
}
