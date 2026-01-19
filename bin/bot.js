import { setTimeout } from 'node:timers/promises'
import { formatEther } from 'viem'
import { auctionPriceAt } from '@filoz/synapse-core/auction'
import {
  createClient,
  getActiveAuctions,
  selectFirstAvailableAuction,
  getBalance,
  placeBid,
} from '../index.js'

const {
  ENVIRONMENT = 'calibration',
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PRIVATE_KEY,
  RECIPIENT,
  TOKEN_ADDRESSES,
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

if (!TOKEN_ADDRESSES) {
  console.error('Error: TOKEN_ADDRESSES environment variable is required')
  process.exit(1)
}

const tokenAddresses = TOKEN_ADDRESSES.split(',').map((addr) => addr.trim())

try {
  console.log('Initializing auction bot...')
  console.log(`RPC URL: ${RPC_URL}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Monitoring ${tokenAddresses.length} token(s)`)
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

      const auctions = await getActiveAuctions(publicClient, tokenAddresses)

      if (auctions.length === 0) {
        console.log('No active auctions found.')
        continue
      }

      console.log(`Found ${auctions.length} active auction(s)`)

      const selectedAuction = selectFirstAvailableAuction(auctions)

      if (!selectedAuction) {
        console.log('No auctions with available fees.')
        continue
      }

      const bidAmount = selectedAuction.availableFees
      const block = await publicClient.getBlock()
      const nextBlockPrice = auctionPriceAt(
        selectedAuction,
        block.timestamp + 30n,
      )

      console.log()
      console.log(`Selected auction:`)
      console.log(`  Token: ${selectedAuction.token}`)
      console.log(`  Bid amount: ${formatEther(bidAmount)} tokens`)
      console.log(`  Next block price: ${formatEther(nextBlockPrice)} FIL`)
      console.log(
        `  Start price: ${formatEther(selectedAuction.startPrice)} FIL`,
      )

      if (balance < nextBlockPrice) {
        console.log()
        console.log(
          `Insufficient balance. Need ${formatEther(nextBlockPrice)} FIL but only have ${formatEther(balance)} FIL`,
        )
        continue
      }

      console.log()
      console.log('Placing bid...')

      const receipt = await placeBid({
        walletClient,
        publicClient,
        account,
        tokenAddress: selectedAuction.token,
        amount: bidAmount,
        recipient: /** @type {`0x${string}`} */ (RECIPIENT),
        price: nextBlockPrice,
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
