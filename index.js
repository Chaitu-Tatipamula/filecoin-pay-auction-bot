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
import paymentsAbi from './abi/FilecoinPayV1.abi.json' with { type: 'json' }
import quoterAbi from './abi/QuoterV2.abi.json' with { type: 'json' }

/**
 * @typedef {Object} Clients
 * @property {import('viem').PublicClient} publicClient
 * @property {import('viem').WalletClient} walletClient
 * @property {import('viem').Account} account
 */

/**
 * @param {string} rpcUrl
 * @param {string} privateKey
 * @returns {Promise<Clients>}
 */
export async function createClient(rpcUrl, privateKey) {
  const chainId = await getChainId(rpcUrl)
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
async function getChainId(rpcUrl) {
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
    abi: paymentsAbi,
    functionName: 'burnForFees',
    args: [tokenAddress, recipient, amount],
    value: price,
  })

  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  return receipt
}



/**
 * @typedef {Object} QuoteResult
 * @property {bigint} amountOut
 * @property {bigint} sqrtPriceX96After
 * @property {number} initializedTicksCrossed
 * @property {bigint} gasEstimate
 */

/**
 * Get Uniswap V3 quote for token swap
 *
 * @param {import('viem').PublicClient} publicClient
 * @param {`0x${string}`} quoterAddress
 * @param {`0x${string}`} tokenIn
 * @param {`0x${string}`} tokenOut
 * @param {bigint} amountIn
 * @param {number} fee
 * @returns {Promise<QuoteResult>}
 */
export async function getUniswapQuote(
  publicClient,
  quoterAddress,
  tokenIn,
  tokenOut,
  amountIn,
  fee,
) {
  const { data } = await publicClient.call({
    to: quoterAddress,
    data: encodeFunctionData({
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn, tokenOut, fee, amountIn, sqrtPriceLimitX96: 0n }],
    }),
  })

  if (!data) {
    throw new Error('No data returned from quote')
  }

  const result = decodeFunctionResult({
    abi: quoterAbi,
    functionName: 'quoteExactInputSingle',
    data,
  })

  const [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate] =
    /** @type {[bigint, bigint, number, bigint]} */ (result)

  return {
    amountOut,
    sqrtPriceX96After,
    initializedTicksCrossed,
    gasEstimate,
  }
}
