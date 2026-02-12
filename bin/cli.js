#!/usr/bin/env node
/** Auction Bidder CLI - Manual bidding tool for FilecoinPay fee auctions */
import { Command } from 'commander'
import chalk from 'chalk'
import {
  createPublicClient,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  http,
  extractChain,
} from 'viem'
import { filecoin, filecoinCalibration } from 'viem/chains'
import { getActiveAuction, placeBid } from '../lib/auction.js'
import { createClient, getBalance } from '../lib/client.js'
import { auctionPriceAt } from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'

const CHAIN_ID_MAINNET = 314
const CHAIN_ID_CALIBRATION = 314159

const RPC_URLS = {
  [CHAIN_ID_MAINNET]: 'https://api.node.glif.io/',
  [CHAIN_ID_CALIBRATION]: 'https://api.calibration.node.glif.io/',
}

const KNOWN_TOKENS = {
  [CHAIN_ID_MAINNET]: [
    { address: '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045', symbol: 'USDFC' },
  ],
  [CHAIN_ID_CALIBRATION]: [
    { address: '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0', symbol: 'USDFC' },
  ],
}

/**
 * @param {string} network
 * @returns {{ chainId: 314 | 314159; networkName: string }}
 */
function resolveNetwork(network) {
  const normalized = network.trim().toLowerCase()
  if (normalized === 'mainnet') {
    return { chainId: CHAIN_ID_MAINNET, networkName: 'Mainnet' }
  }
  return { chainId: CHAIN_ID_CALIBRATION, networkName: 'Calibration' }
}

/**
 * @param {bigint} timestamp
 * @returns {string}
 */
function formatTimeAgo(timestamp) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const elapsed = now - timestamp
  if (elapsed < 60n) return `${elapsed}s ago`
  if (elapsed < 3600n) return `${elapsed / 60n}m ago`
  if (elapsed < 86400n) return `${elapsed / 3600n}h ago`
  return `${elapsed / 86400n}d ago`
}

/**
 * @param {number} chainId
 * @returns {string}
 */
function getPaymentsContract(chainId) {
  const chain = getChain(chainId)
  return chain.contracts.payments.address
}

/**
 * @param {number} chainId
 * @param {string} txHash
 * @returns {string}
 */
function getTxUrl(chainId, txHash) {
  const prefix = chainId === CHAIN_ID_CALIBRATION ? 'calibration.' : ''
  return `https://${prefix}filfox.info/en/tx/${txHash}`
}

const program = new Command()

program
  .name('auction-bidder')
  .description('CLI tool for bidding on FilecoinPay fee auctions')
  .version('1.0.0')

// LIST command
program
  .command('list')
  .description('List all active auctions')
  .option(
    '-n, --network <network>',
    'Network (mainnet or calibration)',
    'calibration',
  )
  .option('-t, --token <address>', 'Check a specific token address')
  .option('--rpc <url>', 'Custom RPC URL')
  .action(async (options) => {
    const { chainId, networkName } = resolveNetwork(options.network)
    const rpcUrl = options.rpc || RPC_URLS[chainId]

    console.log(chalk.bold.cyan(`\nActive Auctions on Filecoin ${networkName}`))
    console.log(chalk.gray('━'.repeat(50)))

    const paymentsContract = getPaymentsContract(chainId)
    console.log(chalk.gray(`Payments Contract: ${paymentsContract}\n`))

    const chain = extractChain({
      chains: [filecoin, filecoinCalibration],
      id: chainId,
    })
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })

    const tokensToCheck = options.token
      ? [{ address: options.token, symbol: 'Custom' }]
      : KNOWN_TOKENS[chainId] || []

    let found = false
    for (const token of tokensToCheck) {
      const auction = await getActiveAuction(publicClient, token.address)
      if (!auction) continue

      const now = BigInt(Math.floor(Date.now() / 1000))
      const currentPrice = auctionPriceAt(auction, now)

      found = true
      console.log(chalk.bold.white(`Token: ${token.symbol} (${token.address})`))
      console.log(
        `  ${chalk.green('Available:')} ${formatUnits(auction.availableFees, 18)} ${token.symbol}`,
      )
      console.log(`  ${chalk.blue('Price:')} ${formatEther(currentPrice)} FIL`)
      if (auction.startTime > 0n) {
        console.log(
          `  ${chalk.gray('Started:')} ${formatTimeAgo(auction.startTime)}`,
        )
      }
      console.log()
    }

    if (!found) {
      console.log(chalk.yellow('No active auctions found.'))
      console.log(
        chalk.gray(
          '\nNote: Auctions only exist for ERC20 tokens that have accumulated fees.',
        ),
      )
    }
  })

// BID command
program
  .command('bid')
  .description('Place a bid on an auction')
  .requiredOption('--token <address>', 'Token address to bid on')
  .requiredOption('--private-key <key>', 'Private key of the bidder')
  .option(
    '--amount <amount>',
    'Amount of tokens to request (default: all available)',
  )
  .option('--pay <amount>', 'FIL amount to pay (default: calculated price)')
  .option(
    '-n, --network <network>',
    'Network (mainnet or calibration)',
    'calibration',
  )
  .option('--rpc <url>', 'Custom RPC URL')
  .action(async (options) => {
    const { chainId, networkName } = resolveNetwork(options.network)
    const rpcUrl = options.rpc || RPC_URLS[chainId]

    console.log(chalk.bold.cyan(`\nPlacing Bid on Filecoin ${networkName}`))
    console.log(chalk.gray('━'.repeat(50)))

    const { publicClient, walletClient, account } = await createClient(
      chainId,
      rpcUrl,
      options.privateKey,
    )

    const auction = await getActiveAuction(publicClient, options.token)

    if (!auction) {
      console.error(chalk.red('Error: No active auction for this token.'))
      return
    }

    if (auction.availableFees === 0n) {
      console.error(chalk.red('Error: No tokens available in auction.'))
      return
    }

    const requestAmount = options.amount
      ? parseUnits(options.amount, 18)
      : auction.availableFees

    const block = await publicClient.getBlock()
    const currentPrice = auctionPriceAt(auction, block.timestamp)

    // Contract requires value >= full auction price regardless of requested amount
    const bidValue = options.pay ? parseEther(options.pay) : currentPrice

    console.log(chalk.white(`Token: ${options.token}`))
    console.log(
      chalk.white(`Available: ${formatUnits(auction.availableFees, 18)}`),
    )
    console.log(chalk.white(`Requesting: ${formatUnits(requestAmount, 18)}`))
    console.log(chalk.white(`Price: ${formatEther(bidValue)} FIL`))
    console.log()

    console.log(chalk.gray(`Bidder: ${account.address}`))

    const balance = await getBalance(publicClient, account.address)
    if (balance < bidValue) {
      console.error(
        chalk.red(
          `\nError: Insufficient balance. Have ${formatEther(balance)}, need ${formatEther(bidValue)}`,
        ),
      )
      return
    }

    console.log(chalk.yellow('\nSubmitting transaction...'))

    try {
      const txHash = await placeBid({
        walletClient,
        publicClient,
        account,
        tokenAddress: options.token,
        recipient: account.address,
        amount: requestAmount,
        price: bidValue,
      })

      console.log(chalk.green(`\n✓ Transaction submitted: ${txHash}`))
      console.log(chalk.gray(`  View: ${getTxUrl(chainId, txHash)}`))

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      })

      if (receipt.status === 'success') {
        console.log(chalk.green.bold('\nBid successful!'))
        console.log(
          chalk.white(`  Purchased: ${formatUnits(requestAmount, 18)} tokens`),
        )
        console.log(
          chalk.white(`  Paid: ${formatEther(bidValue)} FIL (burned)`),
        )
      } else {
        console.error(chalk.red('\nTransaction failed'))
      }
    } catch (err) {
      const error = /** @type {Error} */ (err)
      console.error(chalk.red(`\nError: ${error.message || error}`))
      process.exit(1)
    }
  })

program.parse()
