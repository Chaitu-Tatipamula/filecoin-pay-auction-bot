import {
  createPublicClient,
  createWalletClient,
  extractChain,
  formatEther,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration, filecoin } from 'viem/chains'
import {
  auctionInfo,
  auctionFunds,
  auctionPriceAt,
} from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'
import { payments } from '@filoz/synapse-core/abis'
import { ChainId } from 'sushi'
import { getQuote, RouteStatus } from 'sushi/evm'
/**
 * @import {
 *   Account,
 *   Address,
 *   PublicClient,
 *   TransactionReceipt,
 *   WalletClient
 * } from "viem"
 */

export const SUSHISWAP_NATIVE_PLACEHOLDER =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

/**
 * @typedef {Object} Clients
 * @property {PublicClient} publicClient
 * @property {WalletClient} walletClient
 * @property {Account} account
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
  const account = privateKeyToAccount(/** @type {Address} */ (privateKey))

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
 * @param {PublicClient} publicClient
 * @param {string} address
 * @returns {Promise<bigint>}
 */
export async function getBalance(publicClient, address) {
  return await publicClient.getBalance({
    address: /** @type {Address} */ (address),
  })
}

/**
 * @typedef {Object} Auction
 * @property {Address} token
 * @property {bigint} startPrice
 * @property {bigint} startTime
 * @property {bigint} availableFees
 */

/**
 * @param {PublicClient} publicClient
 * @param {string} tokenAddress
 * @returns {Promise<Auction | null>}
 */
export async function getActiveAuction(publicClient, tokenAddress) {
  const auction = await auctionInfo(
    /** @type {any} */ (publicClient),
    /** @type {Address} */ (tokenAddress),
  )

  if (auction.startTime === 0n) {
    return null
  }

  const availableFees = await auctionFunds(
    /** @type {any} */ (publicClient),
    /** @type {Address} */ (tokenAddress),
  )

  return {
    ...auction,
    availableFees,
  }
}

/**
 * @param {object} args
 * @param {WalletClient} args.walletClient
 * @param {PublicClient} args.publicClient
 * @param {Account} args.account
 * @param {Address} args.tokenAddress
 * @param {Address} args.recipient
 * @param {bigint} args.amount
 * @param {bigint} args.price
 * @returns {Promise<TransactionReceipt>}
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
 * @returns {Address}
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

/**
 * Initialize bot configuration and clients
 *
 * @param {NodeJS.ProcessEnv} [env] - Environment variables
 * @returns {Promise<{
 *   publicClient: PublicClient
 *   walletClient: WalletClient
 *   account: Account
 *   walletAddress: Address
 *   usdfcAddress: Address
 *   usdfcAddressMainnet: Address
 *   delay: number
 * }>}
 */
export async function initializeConfig(env = {}) {
  const {
    RPC_URL = 'https://api.calibration.node.glif.io/',
    PRIVATE_KEY,
    DELAY = 600000,
  } = env

  if (!PRIVATE_KEY) {
    throw new Error('Error: PRIVATE_KEY environment variable is required')
  }

  const chainId = await getChainId(RPC_URL)
  const usdfcAddress = getUsdfcAddress(chainId)
  const usdfcAddressMainnet = getUsdfcAddress(ChainId.FILECOIN)

  console.log('Initializing auction bot...')
  console.log(`RPC URL: ${RPC_URL}`)
  console.log(`Monitoring token: USDFC at ${usdfcAddress}`)
  console.log(`Delay between bids: ${Number(DELAY)}ms`)
  console.log()

  const { publicClient, walletClient, account } = await createClient(
    chainId,
    RPC_URL,
    PRIVATE_KEY,
  )
  const walletAddress = account.address

  console.log(`Wallet address: ${walletAddress}`)
  console.log('Initialization complete. Starting auction monitoring...')
  console.log()

  return {
    publicClient,
    walletClient,
    account,
    walletAddress,
    usdfcAddress,
    usdfcAddressMainnet,
    delay: Number(DELAY),
  }
}
/**
 * Get active auction for token and calculate price
 *
 * @param {object} config
 * @param {PublicClient} config.publicClient - Viem public client for blockchain
 *   queries
 * @param {Address} config.tokenAddress - Token contract address
 * @returns {Promise<{
 *   auction: any
 *   bidAmount: bigint
 *   auctionPrice: bigint
 * } | null>}
 */
export async function getTokenAuction({ publicClient, tokenAddress }) {
  const auction = await getActiveAuction(publicClient, tokenAddress)

  if (!auction) {
    console.log(`No active auction found for ${tokenAddress}.`)
    return null
  }

  if (auction.availableFees === 0n) {
    console.log(`No available fees in auction for ${tokenAddress}.`)
    return null
  }

  console.log(
    `Found active auction for token ${tokenAddress} with ${formatEther(auction.availableFees)} tokens available`,
  )

  const block = await publicClient.getBlock()
  const bidAmount = auction.availableFees
  const auctionPrice = auctionPriceAt(auction, block.timestamp)
  return { auction, bidAmount, auctionPrice }
}

/**
 * Check if auction is profitable by comparing with market mainnet price
 *
 * @param {Address} tokenIn - Token address on mainnet
 * @param {Address} tokenOut - Token address on mainnet
 * @param {bigint} availableFees - Amount of USDFC tokens available in auction
 * @param {bigint} totalAuctionPrice - Current auction price in FIL
 * @returns {Promise<boolean>} - Returns true if auction is profitable
 */
export async function isAuctionProfitable(
  tokenIn,
  tokenOut,
  availableFees,
  totalAuctionPrice,
) {
  console.log()
  console.log('Getting Sushiswap quote...')

  /** @type {import('sushi/evm').QuoteResponse} */
  let mainnetMarketQuote
  try {
    mainnetMarketQuote = await getQuote({
      chainId: ChainId.FILECOIN,
      tokenIn,
      tokenOut,
      amount: availableFees,
      maxSlippage: 0.005,
    })
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.log(`Failed to get Sushiswap quote: ${err.message}`)
    console.log('Skipping auction due to quote failure.')
    return false
  }

  if (mainnetMarketQuote.status !== RouteStatus.Success) {
    console.log(`Sushiswap quote unsuccessful: ${mainnetMarketQuote.status}`)
    console.log('Skipping auction due to quote failure.')
    return false
  }

  const amountOut = BigInt(mainnetMarketQuote.assumedAmountOut)
  console.log()
  console.log('Price comparison:')
  console.log(` Auction price: ${formatEther(totalAuctionPrice)}`)
  console.log(` Market price: ${formatEther(BigInt(amountOut))}`)
  console.log(`  Quote input: ${formatEther(availableFees)}`)
  console.log(`  Quote output: ${formatEther(amountOut)}`)

  return BigInt(amountOut) >= totalAuctionPrice
}

/**
 * Process a single auction check iteration
 *
 * @param {object} config
 * @param {PublicClient} config.publicClient - Viem public client for blockchain
 *   queries
 * @param {WalletClient} config.walletClient - Viem wallet client for
 *   transactions
 * @param {Account} config.account - Wallet account for signing transactions
 * @param {Address} config.walletAddress - Address to receive auction tokens
 * @param {Address} config.usdfcAddress - USDFC token contract address
 * @param {Address} config.usdfcAddressMainnet - USDFC token address on mainnet
 */
export async function processAuctions({
  publicClient,
  walletClient,
  account,
  walletAddress,
  usdfcAddress,
  usdfcAddressMainnet,
}) {
  const balance = await getBalance(publicClient, walletAddress)
  console.log(`Wallet balance: ${formatEther(balance)} FIL`)

  const usdfcAuctionData = await getTokenAuction({
    publicClient,
    tokenAddress: usdfcAddress,
  })
  if (!usdfcAuctionData) return

  const { auction, bidAmount, auctionPrice } = usdfcAuctionData

  const chain = getChain(walletClient?.chain?.id)
  const contractAddress = chain.contracts.payments.address

  let gasEstimate
  try {
    gasEstimate = await publicClient.estimateContractGas({
      account,
      address: contractAddress,
      abi: payments,
      functionName: 'burnForFees',
      args: [auction.token, walletAddress, bidAmount],
      value: auctionPrice,
    })
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.log(`Failed to estimate gas: ${err.message}`)
    console.log('Skipping auction due to gas estimation failure.')
    return
  }

  const gasPrice = await publicClient.getGasPrice()
  const estimatedGasCost = gasPrice * gasEstimate
  console.log(
    `Estimated gas cost for bid: ${formatEther(estimatedGasCost)} FIL`,
  )

  const totalAuctionPrice = auctionPrice + estimatedGasCost
  const isProfitable = await isAuctionProfitable(
    usdfcAddressMainnet,
    SUSHISWAP_NATIVE_PLACEHOLDER,
    auction.availableFees,
    totalAuctionPrice,
  )
  if (!isProfitable) {
    console.log()
    console.log('Auction not profitable. Market price below auction price.')
    return
  }

  console.log('Checking balance...')
  console.log()

  if (balance < totalAuctionPrice) {
    console.log(
      `Insufficient balance. Need ${formatEther(totalAuctionPrice)} FIL (including estimated gas) but only have ${formatEther(balance)} FIL`,
    )
    return
  }

  console.log('Placing bid...')

  const receipt = await placeBid({
    walletClient,
    publicClient,
    account,
    price: auctionPrice,
    tokenAddress: /** @type {Address} */ (auction.token),
    amount: bidAmount,
    recipient: /** @type {Address} */ (walletAddress),
  })

  console.log()
  console.log(`Bid successful!`)
  console.log(`  Transaction hash: ${receipt.transactionHash}`)
  console.log(`  Block number: ${receipt.blockNumber}`)
  console.log(`  Gas used: ${receipt.gasUsed}`)
  console.log(
    `  Status: ${receipt.status === 'success' ? 'success' : 'failed'}`,
  )
}
