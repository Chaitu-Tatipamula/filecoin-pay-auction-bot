import { describe, it, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { encodeAbiParameters } from 'viem'
import { RouteStatus } from 'sushi/evm'
import { auctionPriceAt } from '@filoz/synapse-core/auction'
import { getChain } from '@filoz/synapse-core/chains'
import { payments } from '@filoz/synapse-core/abis'
import {
  getActiveAuction,
  getTokenAuction,
  placeBid,
  processAuctions,
} from '../lib/auction.js'

// Function selectors for SDK calls
const AUCTION_INFO_SELECTOR = '0x0448e51a' // auctionInfo(address)
const ACCOUNTS_SELECTOR = '0xad74b775' // accounts(address,address)

function createMockPublicClient(auctionData, additionalMethods = {}) {
  return {
    chain: { id: 314159 },
    request: async (req) => {
      const { method, params } = req
      if (method === 'eth_call') {
        const callData = params[0].data
        if (callData.startsWith(AUCTION_INFO_SELECTOR)) {
          // auctionInfo returns (uint88 startPrice, uint168 startTime)
          return encodeAbiParameters(
            [{ type: 'uint88' }, { type: 'uint168' }],
            [auctionData.startPrice, auctionData.startTime],
          )
        }
        if (callData.startsWith(ACCOUNTS_SELECTOR)) {
          // accounts returns (uint256 funds, uint256 lockupCurrent, uint256 lockupRate, uint256 lockupLastSettledAt)
          return encodeAbiParameters(
            [
              { type: 'uint256' },
              { type: 'uint256' },
              { type: 'uint256' },
              { type: 'uint256' },
            ],
            [auctionData.funds, 0n, 0n, 0n],
          )
        }
        throw new Error(`Unexpected eth_call data: ${callData}`)
      }
      throw new Error(`Unexpected RPC method: ${method}`)
    },
    ...additionalMethods,
  }
}

describe('auction', () => {
  describe('placeBid', () => {
    it('simulates and writes contract with correct parameters', async () => {
      const expectedHash = '0xbid1234'
      const tokenAddress = '0x3333333333333333333333333333333333333333'
      const recipient = '0x4444444444444444444444444444444444444444'
      const amount = 1000n
      const price = 500n
      const chainId = 314159
      const chain = getChain(chainId)
      const contractAddress = chain.contracts.payments.address

      let capturedRequest
      const simulateContract = mock.fn(async (params) => {
        capturedRequest = params
        return { request: params }
      })
      const mockPublicClient = { simulateContract }
      const writeContract = mock.fn(async () => expectedHash)
      const mockWalletClient = {
        chain: { id: chainId },
        writeContract,
      }
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111',
      }

      const hash = await placeBid({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        account: mockAccount,
        tokenAddress,
        recipient,
        amount,
        price,
        nonce: 10,
      })

      assert.equal(hash, expectedHash)
      assert.equal(simulateContract.mock.calls.length, 1)
      assert.equal(writeContract.mock.calls.length, 1)

      const expectedRequest = {
        account: mockAccount,
        address: contractAddress,
        abi: payments,
        functionName: 'burnForFees',
        args: [tokenAddress, recipient, amount],
        value: price,
      }
      assert.deepStrictEqual(capturedRequest, expectedRequest)

      const writeCall = writeContract.mock.calls[0]
      assert.ok(writeCall)
      assert.deepStrictEqual(writeCall.arguments, [
        { ...expectedRequest, nonce: 10 },
      ])
    })
  })

  describe('getActiveAuction', () => {
    const tokenAddress = '0x3333333333333333333333333333333333333333'

    it('returns null when auction startTime is 0', async () => {
      const mockPublicClient = createMockPublicClient({
        startPrice: 1000n,
        startTime: 0n,
        funds: 500n,
      })

      const result = await getActiveAuction(mockPublicClient, tokenAddress)

      assert.equal(result, null)
    })

    it('returns auction object with availableFees when active', async () => {
      const mockPublicClient = createMockPublicClient({
        startPrice: 1000n,
        startTime: 1700000000n,
        funds: 500n,
      })

      const result = await getActiveAuction(mockPublicClient, tokenAddress)

      assert.deepStrictEqual(result, {
        token: tokenAddress,
        startPrice: 1000n,
        startTime: 1700000000n,
        availableFees: 500n,
      })
    })
  })

  describe('getTokenAuction', () => {
    const tokenAddress = '0x3333333333333333333333333333333333333333'

    it('returns null when no active auction', async () => {
      const mockPublicClient = createMockPublicClient({
        startPrice: 1000n,
        startTime: 0n,
        funds: 500n,
      })

      const result = await getTokenAuction({
        publicClient: mockPublicClient,
        tokenAddress,
      })

      assert.equal(result, null)
    })

    it('returns null when auction has no available fees', async () => {
      const mockPublicClient = createMockPublicClient(
        {
          startPrice: 1000n,
          startTime: 1700000000n,
          funds: 0n,
        },
        {
          getBlock: mock.fn(async () => ({ timestamp: 1700000100n })),
        },
      )

      const result = await getTokenAuction({
        publicClient: mockPublicClient,
        tokenAddress,
      })

      assert.equal(result, null)
    })

    it('returns auction data when active with fees', async () => {
      const startPrice = 1000n // Needs to be large enough to not decay to 0
      const startTime = 1700000000n
      const funds = 1n
      const blockTimestamp = 1700000100n

      const mockPublicClient = createMockPublicClient(
        { startPrice, startTime, funds },
        {
          getBlock: mock.fn(async () => ({ timestamp: blockTimestamp })),
        },
      )

      const result = await getTokenAuction({
        publicClient: mockPublicClient,
        tokenAddress,
      })

      const expectedAuction = {
        token: tokenAddress,
        startPrice,
        startTime,
        availableFees: funds,
      }
      const expectedPrice = auctionPriceAt(expectedAuction, blockTimestamp)

      assert.deepStrictEqual(result, {
        auction: expectedAuction,
        bidAmount: funds,
        auctionPrice: expectedPrice,
      })
    })
  })

  describe('processAuctions', () => {
    const walletAddress = '0x1111111111111111111111111111111111111111'
    const usdfcAddress = '0x3333333333333333333333333333333333333333'
    const usdfcAddressMainnet = '0x4444444444444444444444444444444444444444'
    const sushiswapRouterAddress = '0x5555555555555555555555555555555555555555'

    let mockGetBalance
    let mockGetTokenBalance
    let mockGetSwapQuote
    let mockExecuteSwap

    beforeEach(() => {
      mockGetBalance = mock.fn(async () => 10n)
      mockGetTokenBalance = mock.fn(async () => 0n)
      mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.Success,
        assumedAmountOut: '2',
        tx: {
          to: sushiswapRouterAddress,
          data: '0xabcdef',
          value: 0n,
        },
      }))
      mockExecuteSwap = mock.fn(async () => '0xswaphash')
    })

    function createProcessAuctionsMockClient(config, additionalMethods = {}) {
      return createMockPublicClient(config, {
        getBlock: mock.fn(async () => ({ timestamp: 1700000100n })),
        estimateContractGas: mock.fn(async () => 1n),
        estimateGas: mock.fn(async () => 1n),
        getGasPrice: mock.fn(async () => 1n),
        getTransactionCount: mock.fn(async () => 5),
        simulateContract: mock.fn(async () => ({ request: {} })),
        waitForTransactionReceipt: mock.fn(async () => ({ status: 'success' })),
        ...additionalMethods,
      })
    }

    function createMockWalletClient() {
      return {
        chain: { id: 314159 },
        writeContract: mock.fn(async () => '0xbidhash'),
        sendTransaction: mock.fn(async () => '0xswaphash'),
      }
    }

    function createMockAccount() {
      return {
        address: walletAddress,
      }
    }

    it('returns early when no active auction (startTime is 0)', async () => {
      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 1n,
        startTime: 0n, // No active auction
        funds: 1n,
      })

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: createMockWalletClient(),
        account: createMockAccount(),
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuote,
        executeSwap: mockExecuteSwap,
      })

      // getSwapQuote should not be called when there's no active auction
      assert.equal(mockGetSwapQuote.mock.calls.length, 0)
    })

    it('returns early when no available fees (funds is 0)', async () => {
      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 1n,
        startTime: 1700000000n,
        funds: 0n, // No available fees
      })

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: createMockWalletClient(),
        account: createMockAccount(),
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuote,
        executeSwap: mockExecuteSwap,
      })

      // getSwapQuote should not be called when there are no available fees
      assert.equal(mockGetSwapQuote.mock.calls.length, 0)
    })

    it('returns early when swap quote fails', async () => {
      mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.NoWay,
      }))

      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 1n,
        startTime: 1700000000n,
        funds: 1n,
      })

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: createMockWalletClient(),
        account: createMockAccount(),
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuote,
        executeSwap: mockExecuteSwap,
      })

      // Swap quote was called
      assert.equal(mockGetSwapQuote.mock.calls.length, 1)
      // But executeSwap should not be called
      assert.equal(mockExecuteSwap.mock.calls.length, 0)
    })

    it('returns early when not profitable', async () => {
      // Return a swap quote with output less than total cost
      mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.Success,
        assumedAmountOut: '1', // Less than cost
        tx: {
          to: sushiswapRouterAddress,
          data: '0xabcdef',
          value: 0n,
        },
      }))

      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 100n, // High auction price
        startTime: 1700000000n,
        funds: 1n,
      })

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: createMockWalletClient(),
        account: createMockAccount(),
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuote,
        executeSwap: mockExecuteSwap,
      })

      // Swap quote was called
      assert.equal(mockGetSwapQuote.mock.calls.length, 1)
      // But executeSwap should not be called due to unprofitability
      assert.equal(mockExecuteSwap.mock.calls.length, 0)
    })

    it('returns early when insufficient balance', async () => {
      mockGetBalance = mock.fn(async () => 1n) // Not enough

      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 100n, // High auction price
        startTime: 1700000000n,
        funds: 1n,
      })

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: createMockWalletClient(),
        account: createMockAccount(),
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuote,
        executeSwap: mockExecuteSwap,
      })

      // Swap quote was called
      assert.equal(mockGetSwapQuote.mock.calls.length, 1)
      // But executeSwap should not be called due to insufficient balance
      assert.equal(mockExecuteSwap.mock.calls.length, 0)
    })

    it('returns early when transaction submission fails', async () => {
      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 1n,
        startTime: 1700000000n,
        funds: 1n,
      })

      // Make simulateContract throw to fail bid submission
      mockPublicClient.simulateContract = mock.fn(async () => {
        throw new Error('simulation failed')
      })

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: createMockWalletClient(),
        account: createMockAccount(),
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuote,
        executeSwap: mockExecuteSwap,
      })

      // Swap quote was called
      assert.equal(mockGetSwapQuote.mock.calls.length, 1)
      // waitForTransactionReceipt should not be called since submission failed
      assert.equal(
        mockPublicClient.waitForTransactionReceipt.mock.calls.length,
        0,
      )
    })

    it('completes full flow successfully', async () => {
      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 1n,
        startTime: 1700000000n,
        funds: 1n,
      })

      const mockWalletClient = createMockWalletClient()

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: mockWalletClient,
        account: createMockAccount(),
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuote,
        executeSwap: mockExecuteSwap,
      })

      // All key functions should be called
      assert.equal(mockGetSwapQuote.mock.calls.length, 1)
      assert.equal(mockPublicClient.simulateContract.mock.calls.length, 1)
      assert.equal(mockWalletClient.writeContract.mock.calls.length, 1)
      assert.equal(mockExecuteSwap.mock.calls.length, 1)
      assert.equal(
        mockPublicClient.waitForTransactionReceipt.mock.calls.length,
        2,
      ) // bid + swap
    })

    it('submits bid and swap with sequential nonces for frontrunning protection', async () => {
      const baseNonce = 42
      const funds = 1n
      const account = createMockAccount()
      const swapTx = {
        to: sushiswapRouterAddress,
        data: '0xabcdef',
        value: 0n,
      }

      let capturedSimulateRequest
      const mockPublicClient = createProcessAuctionsMockClient(
        {
          startPrice: 1n,
          startTime: 1700000000n,
          funds,
        },
        {
          getTransactionCount: mock.fn(async () => baseNonce),
          simulateContract: mock.fn(async (params) => {
            capturedSimulateRequest = params
            return { request: params }
          }),
        },
      )

      let capturedBidRequest
      const mockWalletClient = {
        chain: { id: 314159 },
        writeContract: mock.fn(async (request) => {
          capturedBidRequest = request
          return '0xbidhash'
        }),
      }

      let capturedSwapArgs
      const mockExecuteSwapWithCapture = mock.fn(async (args) => {
        capturedSwapArgs = args
        return '0xswaphash'
      })

      const mockGetSwapQuoteWithTx = mock.fn(async () => ({
        status: RouteStatus.Success,
        assumedAmountOut: '2',
        tx: swapTx,
      }))

      await processAuctions({
        publicClient: mockPublicClient,
        walletClient: mockWalletClient,
        account,
        walletAddress,
        usdfcAddress,
        usdfcAddressMainnet,
        sushiswapRouterAddress,
        getBalance: mockGetBalance,
        getTokenBalance: mockGetTokenBalance,
        getSwapQuote: mockGetSwapQuoteWithTx,
        executeSwap: mockExecuteSwapWithCapture,
      })

      // Verify two transactions were submitted
      assert.equal(mockWalletClient.writeContract.mock.calls.length, 1)
      assert.equal(mockExecuteSwapWithCapture.mock.calls.length, 1)

      // Verify bid request with base nonce
      assert.deepStrictEqual(capturedBidRequest, {
        ...capturedSimulateRequest,
        nonce: baseNonce,
      })

      // Verify swap request with base nonce + 1
      assert.deepStrictEqual(capturedSwapArgs, {
        walletClient: mockWalletClient,
        account,
        swapTx,
        nonce: baseNonce + 1,
      })
    })
  })
})
