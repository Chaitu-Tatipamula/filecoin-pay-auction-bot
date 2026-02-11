import { formatEther } from 'viem'
import {
  auctionInfo,
  auctionFunds,
  auctionPriceAt,
} from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'
import { payments } from '@filoz/synapse-core/abis'
import { ChainId } from 'sushi'
import { getSwap as defaultGetSwap, RouteStatus } from 'sushi/evm'
import {
  getBalance as defaultGetBalance,
  getTokenBalance as defaultGetTokenBalance,
} from './client.js'
import {
  SUSHISWAP_NATIVE_PLACEHOLDER,
  getQuote as defaultGetQuote,
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

  // This happens where there are no auctions registered for the token (e.g. no fees collected yet)
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
      // @ts-expect-error - chain is inferred from walletClient
      swapHash = await walletClient.sendTransaction({
        account,
        to: swapTx.to,
        data: swapTx.data,
        value: swapTx.value,
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
 * @param {typeof defaultGetQuote} [config.getQuote]
 * @param {typeof defaultGetSwap} [config.getSwap]
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
  getQuote = defaultGetQuote,
  getSwap = defaultGetSwap,
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
  console.log('Getting Sushiswap quote...')

  const quote = await getQuote({
    tokenIn: usdfcAddressMainnet,
    tokenOut: SUSHISWAP_NATIVE_PLACEHOLDER,
    amount: bidAmount,
  })

  if (quote.status !== 'Success') {
    console.log(`Skipping auction: swap quote status is ${quote.status}`)
    return
  }

  const [bidGasEstimate, gasPrice] = await Promise.all([
    publicClient.estimateContractGas({
      account,
      address: contractAddress,
      abi: payments,
      functionName: 'burnForFees',
      args: [/** @type {Address} */ (auction.token), walletAddress, bidAmount],
      value: auctionPrice,
    }),
    publicClient.getGasPrice(),
  ])
  const bidGasCost = gasPrice * bidGasEstimate

  const swapGasCost = swapEnabled ? BigInt(quote.gasSpent) * gasPrice : 0n
  const swapAmountOut = BigInt(quote.assumedAmountOut)
  const totalGasCost = bidGasCost + swapGasCost
  const totalCost = auctionPrice + totalGasCost
  const isProfitable = swapAmountOut >= totalCost

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

  // Get swap transaction data (only if profitable)
  const swapData = swapEnabled
    ? await getSwap({
        chainId: ChainId.FILECOIN,
        tokenIn: usdfcAddressMainnet,
        tokenOut: SUSHISWAP_NATIVE_PLACEHOLDER,
        amount: totalSwapAmount,
        sender: walletAddress,
        maxSlippage: 0.005,
        simulate: false,
      })
    : null

  if (swapData && swapData?.status !== RouteStatus.Success) {
    console.log(
      `Skipping auction: swap data retrieval status is ${swapData?.status}`,
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
    swapTx: swapData?.tx,
  })

  if (!txResult) return

  await waitForReceipts({
    publicClient,
    bidHash: txResult.bidHash,
    swapHash: txResult.swapHash,
  })
}
