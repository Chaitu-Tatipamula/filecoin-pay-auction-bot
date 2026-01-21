import { setTimeout } from 'node:timers/promises'
import { formatEther } from 'viem'
import { auctionPriceAt } from '@filoz/synapse-core/auction'
import { getQuote, RouteStatus } from 'sushi/evm'
import {
  createClient,
  getActiveAuction,
  getBalance,
  getChainId,
  getUsdfcAddress,
  placeBid,
} from '../index.js'
import { ChainId } from 'sushi'

const FIL_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

/**
 * Initialize bot configuration and clients
 *
 * @returns {Promise<{
 *   publicClient: import('viem').PublicClient
 *   walletClient: import('viem').WalletClient
 *   account: import('viem').Account
 *   walletAddress: `0x${string}`
 *   usdfcAddress: `0x${string}`
 *   usdfcAddressMainnet: `0x${string}`
 *   delay: number
 * }>}
 */
async function initialize() {
  const {
    RPC_URL = 'https://api.calibration.node.glif.io/',
    PRIVATE_KEY,
    DELAY = 600_000,
  } = process.env

  if (!PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY environment variable is required')
    process.exit(1)
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
 * Get active auction and calculate price
 *
 * @param {object} config
 * @param {import('viem').PublicClient} config.publicClient - Viem public client
 *   for blockchain queries
 * @param {`0x${string}`} config.usdfcAddress - USDFC token contract address
 * @returns {Promise<{
 *   auction: any
 *   bidAmount: bigint
 *   totalAuctionPrice: bigint
 * } | null>}
 */
async function getAuction({ publicClient, usdfcAddress }) {
  const auction = await getActiveAuction(publicClient, usdfcAddress)

  if (!auction) {
    console.log('No active auction found for USDFC.')
    return null
  }

  if (auction.availableFees === 0n) {
    console.log('No available fees in USDFC auction.')
    return null
  }

  console.log(
    `Found active USDFC auction with ${formatEther(auction.availableFees)} tokens available`,
  )

  const bidAmount = auction.availableFees
  const now = BigInt(Math.floor(Date.now() / 1000))
  const totalAuctionPrice = auctionPriceAt(auction, now)

  return { auction, bidAmount, totalAuctionPrice }
}

/**
 * Check if auction is profitable by comparing with market mainnet price
 *
 * @param {`0x${string}`} tokenIn - Token address on mainnet
 * @param {`0x${string}`} tokenOut - Token address on mainnet
 * @param {bigint} availableFees - Amount of USDFC tokens available in auction
 * @param {bigint} totalAuctionPrice - Current auction price in FIL
 * @returns {Promise<boolean>} - Returns true if auction is profitable
 */
async function isAuctionProfitable(
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
      tokenOut: FIL_ADDRESS,
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

  return BigInt(amountOut) > totalAuctionPrice
}

/**
 * Execute bid on auction
 *
 * @param {object} config
 * @param {import('viem').WalletClient} config.walletClient - Viem wallet client
 *   for transactions
 * @param {import('viem').PublicClient} config.publicClient - Viem public client
 *   for blockchain queries
 * @param {import('viem').Account} config.account - Wallet account for signing
 *   transactions
 * @param {`0x${string}`} config.walletAddress - Address to receive auction
 *   tokens
 * @param {any} auction - Auction data including token address
 * @param {bigint} bidAmount - Amount of tokens to bid for
 * @param {bigint} totalAuctionPrice - Price to pay in FIL
 */
async function executeBid(
  { walletClient, publicClient, account, walletAddress },
  auction,
  bidAmount,
  totalAuctionPrice,
) {
  console.log('Placing bid...')

  const receipt = await placeBid({
    walletClient,
    publicClient,
    account,
    price: totalAuctionPrice,
    tokenAddress: /** @type {`0x${string}`} */ (auction.token),
    amount: bidAmount,
    recipient: /** @type {`0x${string}`} */ (walletAddress),
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

/**
 * Process a single auction check iteration
 *
 * @param {object} config
 * @param {import('viem').PublicClient} config.publicClient - Viem public client
 *   for blockchain queries
 * @param {import('viem').WalletClient} config.walletClient - Viem wallet client
 *   for transactions
 * @param {import('viem').Account} config.account - Wallet account for signing
 *   transactions
 * @param {`0x${string}`} config.walletAddress - Address to receive auction
 *   tokens
 * @param {`0x${string}`} config.usdfcAddress - USDFC token contract address
 * @param {`0x${string}`} config.usdfcAddressMainnet - USDFC token address on
 *   mainnet
 */
async function processAuctions({
  publicClient,
  walletClient,
  account,
  walletAddress,
  usdfcAddress,
  usdfcAddressMainnet,
}) {
  const balance = await getBalance(publicClient, walletAddress)
  console.log(`Wallet balance: ${formatEther(balance)} FIL`)

  const usdfcAuctionData = await getAuction({ publicClient, usdfcAddress })
  if (!usdfcAuctionData) return

  const { auction, bidAmount, totalAuctionPrice } = usdfcAuctionData

  const isProfitable = await isAuctionProfitable(
    usdfcAddressMainnet,
    FIL_ADDRESS,
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
      `Insufficient balance. Need ${formatEther(totalAuctionPrice)} FIL but only have ${formatEther(balance)} FIL`,
    )
    return
  }

  await executeBid(
    { walletClient, publicClient, account, walletAddress },
    auction,
    bidAmount,
    totalAuctionPrice,
  )
}

try {
  const config = await initialize()

  let sleep = false
  while (true) {
    if (sleep) {
      console.log(`Waiting ${config.delay}ms until next check...`)
      console.log()
      await setTimeout(config.delay)
    }
    sleep = true

    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] Starting auction check...`)

    try {
      await processAuctions(config)
    } catch (error) {
      const err = /** @type {Error} */ (error)
      console.log()
      console.error(`Error during auction check: ${err.message}`)
    }
  }
} catch (error) {
  const err = /** @type {Error} */ (error)
  console.log()
  console.error(`Fatal error: ${err.message}`)
  console.error(err)
  process.exit(1)
}
