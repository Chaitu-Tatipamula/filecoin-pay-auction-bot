import { setTimeout } from 'node:timers/promises'
import { formatEther } from 'viem'
import {
  createClient,
  getActiveAuctions,
  selectFirstAvailableAuction,
  calculateCurrentPrice,
  getBalance,
  placeBid,
} from '../index.js'

const {
  ENVIRONMENT = 'calibration',
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PRIVATE_KEY,
  CONTRACT_ADDRESS = '0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0',
  RECIPIENT,
  TOKEN_ADDRESSES,
  DELAY = 3_600_000,
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

;(async () => {
  try {
    console.log('Initializing auction bot...')
    console.log(`RPC URL: ${RPC_URL}`)
    console.log(`Contract: ${CONTRACT_ADDRESS}`)
    console.log(`Recipient: ${RECIPIENT}`)
    console.log(`Monitoring ${tokenAddresses.length} token(s)`)
    console.log(`Delay between bids: ${Number(DELAY)}ms\n`)

    const { publicClient, walletClient, account } = createClient(
      ENVIRONMENT,
      RPC_URL,
      PRIVATE_KEY,
    )
    const walletAddress = account.address

    console.log(`Wallet address: ${walletAddress}`)

    const balance = await getBalance(publicClient, walletAddress)
    console.log(`Wallet balance: ${formatEther(balance)} FIL\n`)

    console.log('Initialization complete. Starting auction monitoring...\n')

    while (true) {
      const timestamp = new Date().toISOString()
      console.log(`[${timestamp}] Starting auction check...`)

      try {
        const balance = await getBalance(publicClient, walletAddress)
        console.log(`Wallet balance: ${formatEther(balance)} FIL`)

        const auctions = await getActiveAuctions(
          publicClient,
          CONTRACT_ADDRESS,
          tokenAddresses,
        )

        console.log(`Found ${auctions.length} active auction(s)`)

        if (auctions.length === 0) {
          console.log('No active auctions found. Waiting for next check...\n')
          await setTimeout(Number(DELAY))
          continue
        }

        const selectedAuction = selectFirstAvailableAuction(auctions)

        if (!selectedAuction) {
          console.log(
            'No auctions with available fees. Waiting for next check...\n',
          )
          await setTimeout(Number(DELAY))
          continue
        }

        const bidAmount = selectedAuction.availableFees
        const currentPrice = calculateCurrentPrice(
          selectedAuction.startPrice,
          selectedAuction.startTime,
        )

        console.log(`\nSelected auction:`)
        console.log(`  Token: ${selectedAuction.token}`)
        console.log(`  Bid amount: ${formatEther(bidAmount)} tokens`)
        console.log(`  Current price: ${formatEther(currentPrice)} FIL`)
        console.log(
          `  Start price: ${formatEther(selectedAuction.startPrice)} FIL`,
        )

        if (balance < currentPrice) {
          console.log(
            `\nInsufficient balance. Need ${formatEther(currentPrice)} FIL but only have ${formatEther(balance)} FIL`,
          )
          console.log('Waiting for next check...\n')
          await setTimeout(Number(DELAY))
          continue
        }

        console.log('\nPlacing bid...')

        const receipt = await placeBid(
          walletClient,
          publicClient,
          CONTRACT_ADDRESS,
          selectedAuction.token,
          RECIPIENT,
          bidAmount,
          currentPrice,
        )

        console.log(`\nBid successful!`)
        console.log(`  Transaction hash: ${receipt.transactionHash}`)
        console.log(`  Block number: ${receipt.blockNumber}`)
        console.log(`  Gas used: ${receipt.gasUsed}`)
        console.log(
          `  Status: ${receipt.status === 'success' ? 'success' : 'failed'}`,
        )
      } catch (error) {
        const err = /** @type {Error} */ (error)
        console.error(`\nError during auction check: ${err.message}`)
        console.error('Continuing to next iteration...')
      }

      console.log(`\nWaiting ${Number(DELAY)}ms until next check...\n`)
      await setTimeout(Number(DELAY))
    }
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.error(`\nFatal error: ${err.message}`)
    console.error(err)
    process.exit(1)
  }
})()
