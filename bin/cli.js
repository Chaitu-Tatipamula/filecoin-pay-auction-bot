#!/usr/bin/env node
/** Auction Bidder CLI - Manual bidding tool for FilecoinPay fee auctions */
import { Command } from 'commander'
import chalk from 'chalk'
import { createPublicClient, parseEther, http, extractChain } from 'viem'
import { filecoin, filecoinCalibration } from 'viem/chains'
import {
  createClient,
  getBalance,
  getActiveAuction,
  placeBid,
} from '../index.js'
import { auctionPriceAt } from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'

const program = new Command()

program
  .name('auction-bidder')
  .description('CLI tool for bidding on FilecoinPay fee auctions')
  .version('1.0.0')

// Known tokens
const KNOWN_TOKENS = {
  314: [
    { address: '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045', symbol: 'USDFC' },
  ],
  314159: [
    { address: '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0', symbol: 'USDFC' },
  ],
}

/**
 * @param {bigint} wei
 * @returns {string}
 */
function formatFIL(wei) {
  const fil = Number(wei) / 1e18
  if (fil === 0) return '0'
  if (fil < 0.000001) return `${wei.toString()} wei`
  return fil.toFixed(6)
}

/**
 * @param {bigint} wei
 * @param {number} decimals
 * @returns {string}
 */
function formatTokenAmount(wei, decimals = 18) {
  const amount = Number(wei) / Math.pow(10, decimals)
  if (amount === 0) return '0'
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 })
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

// LIST command
program
  .command('list')
  .description('List all active auctions')
  .option(
    '-n, --network <network>',
    'Network (mainnet or calibration)',
    'mainnet',
  )
  .option('-t, --token <address>', 'Check a specific token address')
  .option('--rpc <url>', 'Custom RPC URL')
  .action(async (options) => {
    const chainId = options.network === 'calibration' ? 314159 : 314
    const networkName =
      options.network === 'calibration' ? 'Calibration' : 'Mainnet'
    const rpcUrl =
      options.rpc ||
      (chainId === 314159
        ? 'https://api.calibration.node.glif.io/'
        : 'https://api.node.glif.io/')

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
        `  ${chalk.green('Available:')} ${formatTokenAmount(auction.availableFees)} ${token.symbol}`,
      )
      console.log(`  ${chalk.blue('Price:')} ${formatFIL(currentPrice)} FIL`)
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
    'mainnet',
  )
  .option('--rpc <url>', 'Custom RPC URL')
  .action(async (options) => {
    const chainId = options.network === 'calibration' ? 314159 : 314
    const networkName =
      options.network === 'calibration' ? 'Calibration' : 'Mainnet'
    const rpcUrl =
      options.rpc ||
      (chainId === 314159
        ? 'https://api.calibration.node.glif.io/'
        : 'https://api.node.glif.io/')

    console.log(chalk.bold.cyan(`\nPlacing Bid on Filecoin ${networkName}`))
    console.log(chalk.gray('━'.repeat(50)))

    const { publicClient, walletClient, account } = await createClient(
      chainId,
      rpcUrl,
      options.privateKey,
    )

    const auction = await getActiveAuction(publicClient, options.token)

    if (!auction) {
      console.log(chalk.red('Error: No active auction for this token.'))
      return
    }

    if (auction.availableFees === 0n) {
      console.log(chalk.red('Error: No tokens available in auction.'))
      return
    }

    const requestAmount = options.amount
      ? BigInt(options.amount)
      : auction.availableFees

    const now = BigInt(Math.floor(Date.now() / 1000))
    const currentPrice = auctionPriceAt(auction, now)

    let bidValue
    if (options.pay) {
      bidValue = parseEther(options.pay)
    } else if (requestAmount === auction.availableFees) {
      // Add 0.5% buffer to account for block timing differences
      bidValue = currentPrice + currentPrice / 200n
    } else {
      const proportionalPrice =
        (currentPrice * requestAmount) / auction.availableFees
      bidValue = proportionalPrice + proportionalPrice / 200n
    }

    console.log(chalk.white(`Token: ${options.token}`))
    console.log(
      chalk.white(`Available: ${formatTokenAmount(auction.availableFees)}`),
    )
    console.log(chalk.white(`Requesting: ${formatTokenAmount(requestAmount)}`))
    console.log(chalk.white(`Price: ${formatFIL(bidValue)} FIL`))
    console.log()

    console.log(chalk.gray(`Bidder: ${account.address}`))

    const balance = await getBalance(publicClient, account.address)
    if (balance < bidValue) {
      console.log(
        chalk.red(
          `\nError: Insufficient balance. Have ${formatFIL(balance)}, need ${formatFIL(bidValue)}`,
        ),
      )
      return
    }

    console.log(chalk.yellow('\nSubmitting transaction...'))

    try {
      const receipt = await placeBid({
        walletClient,
        publicClient,
        account,
        tokenAddress: options.token,
        recipient: account.address,
        amount: requestAmount,
        price: bidValue,
      })

      console.log(
        chalk.green(`\n✓ Transaction submitted: ${receipt.transactionHash}`),
      )
      console.log(
        chalk.gray(
          `  View: https://${chainId === 314159 ? 'calibration.' : ''}filfox.info/en/tx/${receipt.transactionHash}`,
        ),
      )

      if (receipt.status === 'success') {
        console.log(chalk.green.bold('\nBid successful!'))
        console.log(
          chalk.white(
            `  Purchased: ${formatTokenAmount(requestAmount)} tokens`,
          ),
        )
        console.log(chalk.white(`  Paid: ${formatFIL(bidValue)} FIL (burned)`))
      } else {
        console.log(chalk.red('\nTransaction failed'))
      }
    } catch (err) {
      const error = /** @type {Error} */ (err)
      console.log(chalk.red(`\nError: ${error.message || error}`))
      process.exit(1)
    }
  })

program.parse()
