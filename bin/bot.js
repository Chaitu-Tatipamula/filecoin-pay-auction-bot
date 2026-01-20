import { setTimeout } from 'node:timers/promises'
import { createPublicClient, formatEther, http } from 'viem'
import { auctionPriceAt } from '@filoz/synapse-core/auction'
import {
  createClient,
  getActiveAuction,
  getBalance,
  placeBid,
  getUniswapQuote,
} from '../index.js'
import { filecoin } from 'viem/chains'

const USDFC_ADDRESS = {
  calibration: '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0',
  mainnet: '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',
}

const WFIL_ADDRESS = {
  calibration: '0xaC26a4Ab9cF2A8c5DBaB6fb4351ec0F4b07356c4',
  mainnet: '0x60e1773636cf5e4a227d9ac24f20feca034ee25a',
}

const MAINNET_RPC_URL = 'https://api.node.glif.io/'

const QUOTER_ADDRESS_MAINNET = '0xE45C06922228A33fFf1ED54638A0db78f69F9780'

const {
  ENVIRONMENT = 'calibration',
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PRIVATE_KEY,
  RECIPIENT,
  UNISWAP_FEE_TIER = '500',
  DELAY = 600_000,
} = process.env

if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY environment variable is required')
  process.exit(1)
}

if (!RECIPIENT) {
  console.error('Error: RECIPIENT environment variable is required')
  process.exit(1)
}

const usdfcAddress = /** @type {`0x${string}`} */ (
  USDFC_ADDRESS[/** @type {'calibration' | 'mainnet'} */ (ENVIRONMENT)]
)
const wfilAddress = /** @type {`0x${string}`} */ (
  WFIL_ADDRESS[/** @type {'calibration' | 'mainnet'} */ (ENVIRONMENT)]
)

const feeTier = Number(UNISWAP_FEE_TIER)

const mainnetPublicClient = createPublicClient({
  chain: filecoin,
  transport: http(MAINNET_RPC_URL),
})

try {
  console.log('Initializing auction bot...')
  console.log(`RPC URL: ${RPC_URL}`)
  console.log(`Environment: ${ENVIRONMENT}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Monitoring token: USDFC at ${usdfcAddress}`)
  console.log(`Quote pair: WFIL → USDFC at ${wfilAddress}`)
  console.log(`Uniswap fee tier: ${feeTier / 10000}%`)
  console.log(`Delay between bids: ${Number(DELAY)}ms`)
  console.log()

  const { publicClient, walletClient, account } = createClient(
    ENVIRONMENT,
    RPC_URL,
    PRIVATE_KEY,
  )
  const walletAddress = account.address

  console.log(`Wallet address: ${walletAddress}`)

  console.log('Initialization complete. Starting auction monitoring...')
  console.log()

  let sleep = false
  while (true) {
    if (sleep) {
      console.log(`Waiting ${Number(DELAY)}ms until next check...`)
      console.log()
      await setTimeout(Number(DELAY))
    }
    sleep = true

    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] Starting auction check...`)

    try {
      const balance = await getBalance(publicClient, walletAddress)
      console.log(`Wallet balance: ${formatEther(balance)} FIL`)

      const auction = await getActiveAuction(publicClient, usdfcAddress)

      if (!auction) {
        console.log('No active auction found for USDFC.')
        continue
      }

      if (auction.availableFees === 0n) {
        console.log('No available fees in USDFC auction.')
        continue
      }

      console.log(
        `Found active USDFC auction with ${formatEther(auction.availableFees)} tokens available`,
      )

      const bidAmount = auction.availableFees
      const now = BigInt(Math.floor(Date.now() / 1000))
      const totalAuctionPrice = auctionPriceAt(auction, now)

      console.log()
      console.log('Getting Uniswap quote...')

      let marketQuote
      try {
        marketQuote = await getUniswapQuote(
          mainnetPublicClient,
          QUOTER_ADDRESS_MAINNET,
          /** @type {`0x${string}`} */(USDFC_ADDRESS.mainnet),
          /** @type {`0x${string}`} */(WFIL_ADDRESS.mainnet),
          auction.availableFees,
          feeTier,
        )
      } catch (error) {
        const err = /** @type {Error} */ (error)
        console.log(`Failed to get Uniswap quote: ${err.message}`)
        console.log('Skipping auction due to quote failure.')
        continue
      }

      console.log()
      console.log('Price comparison:')
      console.log(` Total auction price: ${formatEther(totalAuctionPrice)} FIL`)
      console.log(
        ` Market quote for auction: ${formatEther(marketQuote.amountOut)} FIL`,
      )
      console.log(`  Quote input: ${formatEther(auction.availableFees)} USDFC`)
      console.log(`  Quote output: ${formatEther(marketQuote.amountOut)} WFIL`)

      if (totalAuctionPrice > marketQuote.amountOut) {
        console.log()
        console.log('Auction not profitable. Market price below auction price.')
        continue
      }

      console.log()
      console.log('Auction is profitable! Checking balance...')

      if (balance < totalAuctionPrice) {
        console.log()
        console.log(
          `Insufficient balance. Need ${formatEther(totalAuctionPrice)} FIL but only have ${formatEther(balance)} FIL`,
        )
        continue
      }

      console.log()
      console.log('Placing bid...')

      const receipt = await placeBid({
        walletClient,
        publicClient,
        account,
        price: totalAuctionPrice,
        tokenAddress: auction.token,
        amount: bidAmount,
        recipient: /** @type {`0x${string}`} */ (RECIPIENT),
      })

      console.log()
      console.log(`Bid successful!`)
      console.log(`  Transaction hash: ${receipt.transactionHash}`)
      console.log(`  Block number: ${receipt.blockNumber}`)
      console.log(`  Gas used: ${receipt.gasUsed}`)
      console.log(
        `  Status: ${receipt.status === 'success' ? 'success' : 'failed'}`,
      )
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
