import { formatEther } from 'viem'
import {
  auctionInfo,
  auctionFunds,
  auctionPriceAt,
} from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'
import { payments } from '@filoz/synapse-core/abis'
import { RouteStatus } from 'sushi/evm'
import { getBalance, getTokenBalance } from './client.js'
import { SUSHISWAP_NATIVE_PLACEHOLDER, getSwapQuote } from './swap.js'
/**
 * @import {
 *   Account,
 *   Address,
 *   PublicClient,
 *   TransactionReceipt,
 *   WalletClient
 * } from "viem"
 */

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
 * Submit bid and swap transactions simultaneously using nonce+1 to reduce
 * frontrunning window
 *
 * @param {object} args
 * @param {PublicClient} args.publicClient
 * @param {WalletClient} args.walletClient
 * @param {Account} args.account
 * @param {Address} args.contractAddress - Payments contract address
 * @param {Address} args.tokenAddress - Token to bid on
 * @param {Address} args.recipient - Recipient of auction tokens
 * @param {bigint} args.bidAmount - Amount to bid for
 * @param {bigint} args.auctionPrice - Price to pay in FIL
 * @param {{ to: Address; data: `0x${string}`; value: bigint }} args.swapTx -
 *   Swap transaction data
 * @returns {Promise<{
 *   bidReceipt: TransactionReceipt
 *   swapReceipt: TransactionReceipt
 * }>}
 */
export async function placeBidAndSwap({
  publicClient,
  walletClient,
  account,
  contractAddress,
  tokenAddress,
  recipient,
  bidAmount,
  auctionPrice,
  swapTx,
}) {
  // Get current nonce
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
  })

  console.log(
    `Submitting bid (nonce ${nonce}) and swap (nonce ${nonce + 1}) simultaneously...`,
  )

  // Simulate burnForFees first to catch errors early
  const { request } = await publicClient.simulateContract({
    account,
    address: contractAddress,
    abi: payments,
    functionName: 'burnForFees',
    args: [tokenAddress, recipient, bidAmount],
    value: auctionPrice,
  })

  // Submit burnForFees with nonce N
  const bidHash = await walletClient.writeContract({
    ...request,
    nonce,
  })

  // Submit swap with nonce N+1 immediately (don't wait for bid confirmation)
  // @ts-expect-error - chain is inferred from walletClient
  const swapHash = await walletClient.sendTransaction({
    account,
    to: swapTx.to,
    data: swapTx.data,
    value: swapTx.value,
    nonce: nonce + 1,
  })

  console.log(`Bid transaction: ${bidHash}`)
  console.log(`Swap transaction: ${swapHash}`)

  // Wait for both receipts in parallel
  const [bidReceipt, swapReceipt] = await Promise.all([
    publicClient.waitForTransactionReceipt({ hash: bidHash }),
    publicClient.waitForTransactionReceipt({ hash: swapHash }),
  ])

  return { bidReceipt, swapReceipt }
}

/**
 * Log transaction receipt details
 *
 * @param {string} label
 * @param {TransactionReceipt} receipt
 */
function logReceipt(label, receipt) {
  console.log()
  console.log(`${label}:`)
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
 * @param {PublicClient} config.publicClient
 * @param {WalletClient} config.walletClient
 * @param {Account} config.account
 * @param {Address} config.walletAddress
 * @param {Address} config.usdfcAddress
 * @param {Address} config.usdfcAddressMainnet
 * @param {Address | null} config.sushiswapRouterAddress
 */
export async function processAuctions({
  publicClient,
  walletClient,
  account,
  walletAddress,
  usdfcAddress,
  usdfcAddressMainnet,
  sushiswapRouterAddress,
}) {
  const balance = await getBalance(publicClient, walletAddress)
  console.log(`Wallet balance: ${formatEther(balance)} FIL`)

  const existingUsdfcBalance = await getTokenBalance(
    publicClient,
    usdfcAddress,
    walletAddress,
  )
  console.log(
    `Existing USDFC balance: ${formatEther(existingUsdfcBalance)} USDFC`,
  )

  const auctionData = await getTokenAuction({
    publicClient,
    tokenAddress: usdfcAddress,
  })
  if (!auctionData) return

  const { auction, bidAmount, auctionPrice } = auctionData
  const chain = getChain(walletClient?.chain?.id)
  const contractAddress = chain.contracts.payments.address
  const swapEnabled = sushiswapRouterAddress !== null

  // Estimate gas for burnForFees
  let bidGasEstimate
  try {
    bidGasEstimate = await publicClient.estimateContractGas({
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
  const bidGasCost = gasPrice * bidGasEstimate
  console.log(`Estimated gas cost for bid: ${formatEther(bidGasCost)} FIL`)

  // Get swap quote for profitability check
  const totalSwapAmount = existingUsdfcBalance + bidAmount
  console.log()
  console.log('Getting Sushiswap swap quote...')

  const swapQuote = await getSwapQuote({
    tokenIn: usdfcAddressMainnet,
    tokenOut: /** @type {Address} */ (SUSHISWAP_NATIVE_PLACEHOLDER),
    amount: totalSwapAmount,
    sender: walletAddress,
  })

  if (swapQuote?.status !== RouteStatus.Success) {
    console.log(`Skipping auction: swap quote status is ${swapQuote?.status}`)
    return
  }

  let swapGasEstimate = 0n
  try {
    swapGasEstimate = swapEnabled
      ? await publicClient.estimateGas({
          account: walletAddress,
          to: swapQuote.tx.to,
          data: swapQuote.tx.data,
          value: swapQuote.tx.value,
        })
      : 0n
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.log(`Failed to estimate swap gas: ${err.message}`)
  }

  const swapGasCost = swapEnabled ? gasPrice * swapGasEstimate : 0n
  if (swapEnabled) {
    console.log(`Estimated gas cost for swap: ${formatEther(swapGasCost)} FIL`)
  }

  // Profitability check
  const totalGasCost = bidGasCost + swapGasCost
  const totalCost = auctionPrice + totalGasCost
  const swapAmountOut = BigInt(swapQuote.assumedAmountOut)

  console.log()
  console.log('Price comparison:')
  console.log(` Auction price: ${formatEther(auctionPrice)} FIL`)
  console.log(` Total gas cost: ${formatEther(totalGasCost)} FIL`)
  console.log(` Total cost: ${formatEther(totalCost)} FIL`)
  console.log(` Swap out amount: ${formatEther(swapAmountOut)} FIL`)

  if (swapAmountOut < totalCost) {
    console.log()
    console.log('Auction not profitable. Swap output below total cost.')
    return
  }

  console.log()
  console.log('Checking balance...')

  if (balance < totalCost) {
    console.log(
      `Insufficient balance. Need ${formatEther(totalCost)} FIL (including estimated gas) but only have ${formatEther(balance)} FIL`,
    )
    return
  }

  // Execute bid (with or without swap)
  if (swapEnabled) {
    console.log('Placing bid and swap simultaneously (nonce+1)...')
    console.log()

    try {
      const { bidReceipt, swapReceipt } = await placeBidAndSwap({
        publicClient,
        walletClient,
        account,
        contractAddress,
        tokenAddress: /** @type {Address} */ (auction.token),
        recipient: /** @type {Address} */ (walletAddress),
        bidAmount,
        auctionPrice,
        swapTx: swapQuote.tx,
      })

      logReceipt('Bid result', bidReceipt)
      logReceipt('Swap result', swapReceipt)

      if (swapReceipt.status !== 'success') {
        console.log()
        console.log('Swap failed. USDFC held for next iteration.')
      }
    } catch (error) {
      const err = /** @type {Error} */ (error)
      console.log(`Bid+swap failed: ${err.message}`)
      console.log('Will retry next iteration.')
    }
  } else {
    console.log('Placing bid...')

    const bidReceipt = await placeBid({
      walletClient,
      publicClient,
      account,
      tokenAddress: /** @type {Address} */ (auction.token),
      recipient: /** @type {Address} */ (walletAddress),
      amount: bidAmount,
      price: auctionPrice,
    })

    logReceipt('Bid result', bidReceipt)

    if (bidReceipt.status !== 'success') {
      console.log('Bid failed.')
    }
  }
}
