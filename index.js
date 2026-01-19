import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration, filecoin } from 'viem/chains'
import { payments } from '@filoz/synapse-core/abis'
import { auctionInfo, auctionFunds } from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'

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
 * @param {string[]} tokenAddresses
 * @returns {Promise<Auction[]>}
 */
export async function getActiveAuctions(publicClient, tokenAddresses) {
  const auctions = []

  for (const token of tokenAddresses) {
    const auction = await auctionInfo(
      /** @type {any} */ (publicClient),
      /** @type {`0x${string}`} */ (token),
    )

    if (auction.startTime === 0n) {
      continue
    }

    const availableFees = await auctionFunds(
      /** @type {any} */ (publicClient),
      /** @type {`0x${string}`} */ (token),
    )

    auctions.push({
      ...auction,
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
