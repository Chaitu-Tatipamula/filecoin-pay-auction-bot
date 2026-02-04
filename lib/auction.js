import { formatEther } from 'viem'
import {
  auctionInfo,
  auctionFunds,
  auctionPriceAt,
} from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'
import { payments } from '@filoz/synapse-core/abis'
import { RouteStatus } from 'sushi/evm'
import {
  getBalance as defaultGetBalance,
  getTokenBalance as defaultGetTokenBalance,
} from './client.js'
import {
  SUSHISWAP_NATIVE_PLACEHOLDER,
  executeSwap as defaultExecuteSwap,
  getSwapQuote as defaultGetSwapQuote,
} from './swap.js'
import { logReceipt } from './helpers.js'

/**
 * @import {
 *   Account,
 *   Address,
 *   PublicClient,
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

  const block = await publicClient.getBlock()
  const bidAmount = auction.availableFees
  const auctionPrice = auctionPriceAt(auction, block.timestamp)
  return { auction, bidAmount, auctionPrice }
}

/**
 * Place a bid on an auction and return the transaction hash
 *
 * @param {object} args
 * @param {WalletClient} args.walletClient
 * @param {PublicClient} args.publicClient
 * @param {Account} args.account
 * @param {Address} args.tokenAddress
 * @param {Address} args.recipient
 * @param {bigint} args.amount
 * @param {bigint} args.price
 * @param {number} [args.nonce] - Optional nonce for transaction ordering
 * @returns {Promise<`0x${string}`>}
 */
export async function placeBid({
  walletClient,
  publicClient,
  account,
  tokenAddress,
  recipient,
  amount,
  price,
  nonce,
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

  const hash = await walletClient.writeContract({
    ...request,
    nonce,
  })

  return hash
}

/**
 * Estimate gas costs for bid and swap transactions
 *
 * @param {object} args
 * @param {PublicClient} args.publicClient
 * @param {Account} args.account
 * @param {Address} args.contractAddress
 * @param {Address} args.tokenAddress
 * @param {Address} args.walletAddress
 * @param {bigint} args.amount
 * @param {bigint} args.price
 * @param {boolean} args.swapEnabled
 * @param {{ to: Address; data: `0x${string}`; value: bigint }} [args.swapTx]
 * @returns {Promise<{ bidGasCost: bigint; swapGasCost: bigint }>}
 */
async function estimateGasCosts({
  publicClient,
  account,
  contractAddress,
  tokenAddress,
  walletAddress,
  amount,
  price,
  swapEnabled,
  swapTx,
}) {
  const [bidGasEstimate, swapGasEstimate, gasPrice] = await Promise.all([
    publicClient.estimateContractGas({
      account,
      address: contractAddress,
      abi: payments,
      functionName: 'burnForFees',
      args: [tokenAddress, walletAddress, amount],
      value: price,
    }),
    swapEnabled && swapTx
      ? publicClient.estimateGas({
          account: walletAddress,
          to: swapTx.to,
          data: swapTx.data,
          value: swapTx.value,
        })
      : Promise.resolve(0n),
    publicClient.getGasPrice(),
  ])

  const bidGasCost = gasPrice * bidGasEstimate
  const swapGasCost = gasPrice * swapGasEstimate

  return { bidGasCost, swapGasCost }
}

/**
 * Check if auction is profitable and log comparison
 *
 * @param {object} args
 * @param {bigint} args.auctionPrice
 * @param {bigint} args.bidGasCost
 * @param {bigint} args.swapGasCost
 * @param {bigint} args.swapAmountOut
 * @returns {{
 *   totalCost: bigint
 *   totalGasCost: bigint
 *   isProfitable: boolean
 * }}
 */
function checkProfitability({
  auctionPrice,
  bidGasCost,
  swapGasCost,
  swapAmountOut,
}) {
  const totalGasCost = bidGasCost + swapGasCost
  const totalCost = auctionPrice + totalGasCost

  return {
    totalCost,
    totalGasCost,
    isProfitable: swapAmountOut >= totalCost,
  }
}

/**
 * Submit bid and swap transactions
 *
 * @param {object} args
 * @param {WalletClient} args.walletClient
 * @param {PublicClient} args.publicClient
 * @param {Account} args.account
 * @param {Address} args.tokenAddress
 * @param {Address} args.walletAddress
 * @param {bigint} args.amount
 * @param {bigint} args.price
 * @param {boolean} args.swapEnabled
 * @param {{ to: Address; data: `0x${string}`; value: bigint }} [args.swapTx]
 * @param {typeof defaultExecuteSwap} args.executeSwap
 * @returns {Promise<{
 *   bidHash: `0x${string}`
 *   swapHash: `0x${string}` | null
 * } | null>}
 */
async function submitBidAndSwap({
  walletClient,
  publicClient,
  account,
  tokenAddress,
  walletAddress,
  amount,
  price,
  swapEnabled,
  swapTx,
  executeSwap,
}) {
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
  })

  if (swapEnabled) {
    console.log(
      `Submitting bid (nonce ${nonce}) and swap (nonce ${nonce + 1}) simultaneously...`,
    )
  } else {
    console.log('Placing bid...')
  }
  console.log()

  try {
    const bidHash = await placeBid({
      walletClient,
      publicClient,
      account,
      tokenAddress,
      recipient: walletAddress,
      amount,
      price,
      nonce,
    })
    console.log(`Bid transaction: ${bidHash}`)

    let swapHash = null
    if (swapEnabled && swapTx) {
      swapHash = await executeSwap({
        walletClient,
        account,
        swapTx,
        nonce: nonce + 1,
      })
      console.log(`Swap transaction: ${swapHash}`)
    }

    return { bidHash, swapHash }
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.log(`Transaction submission failed: ${err.message}`)
    return null
  }
}

/**
 * Wait for transaction receipts and log results
 *
 * @param {object} args
 * @param {PublicClient} args.publicClient
 * @param {`0x${string}`} args.bidHash
 * @param {`0x${string}` | null} args.swapHash
 */
async function waitForReceipts({ publicClient, bidHash, swapHash }) {
  console.log()
  console.log('Waiting for transaction receipts...')

  const [bidReceipt, swapReceipt] = await Promise.all([
    publicClient.waitForTransactionReceipt({ hash: bidHash }),
    swapHash
      ? publicClient.waitForTransactionReceipt({ hash: swapHash })
      : Promise.resolve(null),
  ])

  logReceipt('Bid result', bidReceipt)
  if (bidReceipt.status !== 'success') {
    console.log('Bid failed.')
  }

  if (swapReceipt) {
    logReceipt('Swap result', swapReceipt)
    if (swapReceipt.status !== 'success') {
      console.log()
      console.log('Swap failed. USDFC held for next iteration.')
    }
  }
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
 * @param {typeof defaultGetBalance} [config.getBalance]
 * @param {typeof defaultGetTokenBalance} [config.getTokenBalance]
 * @param {typeof defaultGetSwapQuote} [config.getSwapQuote]
 * @param {typeof defaultExecuteSwap} [config.executeSwap]
 */
export async function processAuctions({
  publicClient,
  walletClient,
  account,
  walletAddress,
  usdfcAddress,
  usdfcAddressMainnet,
  sushiswapRouterAddress,
  getBalance = defaultGetBalance,
  getTokenBalance = defaultGetTokenBalance,
  getSwapQuote = defaultGetSwapQuote,
  executeSwap = defaultExecuteSwap,
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

  const usdfcAuctionData = await getTokenAuction({
    publicClient,
    tokenAddress: usdfcAddress,
  })
  if (!usdfcAuctionData) return

  console.log(
    `Found active auction for USDFC with ${formatEther(usdfcAuctionData.auction.availableFees)} tokens available`,
  )

  const { auction, bidAmount, auctionPrice } = usdfcAuctionData
  const chain = getChain(walletClient?.chain?.id)
  const contractAddress = chain.contracts.payments.address
  const swapEnabled = sushiswapRouterAddress !== null

  const totalSwapAmount = existingUsdfcBalance + bidAmount
  console.log()
  console.log('Getting Sushiswap swap quote...')

  const swapQuote = await getSwapQuote({
    tokenIn: usdfcAddressMainnet,
    tokenOut: /** @type {Address} */ (SUSHISWAP_NATIVE_PLACEHOLDER),
    amount: totalSwapAmount,
    sender: walletAddress,
  })

  if (swapQuote.status !== RouteStatus.Success) {
    console.log(`Skipping auction: swap quote status is ${swapQuote.status}`)
    return
  }

  const gasCosts = await estimateGasCosts({
    publicClient,
    account,
    contractAddress,
    tokenAddress: /** @type {Address} */ (auction.token),
    walletAddress,
    amount: bidAmount,
    price: auctionPrice,
    swapEnabled,
    swapTx: swapQuote.tx,
  })

  const swapAmountOut = BigInt(swapQuote.assumedAmountOut)
  const { totalCost, totalGasCost, isProfitable } = checkProfitability({
    ...gasCosts,
    auctionPrice,
    swapAmountOut,
  })

  console.log()
  console.log('Price comparison:')
  console.log(` Auction price: ${formatEther(auctionPrice)} FIL`)
  console.log(` Total gas cost: ${formatEther(totalGasCost)} FIL`)
  console.log(` Total cost: ${formatEther(totalCost)} FIL`)
  console.log(` Swap out amount: ${formatEther(swapAmountOut)} FIL`)

  if (!isProfitable) {
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

  const txResult = await submitBidAndSwap({
    walletClient,
    publicClient,
    account,
    tokenAddress: /** @type {Address} */ (auction.token),
    walletAddress,
    amount: bidAmount,
    price: auctionPrice,
    swapEnabled,
    swapTx: swapQuote.tx,
    executeSwap,
  })

  if (!txResult) return

  await waitForReceipts({
    publicClient,
    bidHash: txResult.bidHash,
    swapHash: txResult.swapHash,
  })
}
