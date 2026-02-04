import { describe, it, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { encodeAbiParameters } from 'viem'
import { RouteStatus } from 'sushi/evm'
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
      const mockRequest = { someRequest: true }

      const simulateContract = mock.fn(async () => ({ request: mockRequest }))
      const mockPublicClient = { simulateContract }
      const writeContract = mock.fn(async () => expectedHash)
      const mockWalletClient = {
        chain: { id: 314159 },
        writeContract,
      }
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111',
      }

      const hash = await placeBid({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        account: mockAccount,
        tokenAddress: '0x3333333333333333333333333333333333333333',
        recipient: '0x4444444444444444444444444444444444444444',
        amount: 1000n,
        price: 500n,
        nonce: 10,
      })

      assert.equal(hash, expectedHash)
      assert.equal(simulateContract.mock.calls.length, 1)
      assert.equal(writeContract.mock.calls.length, 1)

      const call = writeContract.mock.calls[0]
      assert.ok(call)
      assert.deepEqual(call.arguments, [{ someRequest: true, nonce: 10 }])
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
      const mockPublicClient = createMockPublicClient(
        {
          startPrice: 1000000000000000000n,
          startTime: 1700000000n,
          funds: 500000000000000000n,
        },
        {
          getBlock: mock.fn(async () => ({ timestamp: 1700000100n })),
        },
      )

      const result = await getTokenAuction({
        publicClient: mockPublicClient,
        tokenAddress,
      })

      assert.ok(result)
      assert.equal(result.auction.token, tokenAddress)
      assert.equal(result.auction.startPrice, 1000000000000000000n)
      assert.equal(result.auction.startTime, 1700000000n)
      assert.equal(result.auction.availableFees, 500000000000000000n)
      assert.equal(result.bidAmount, 500000000000000000n)
      assert.ok(result.auctionPrice > 0n)
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
      mockGetBalance = mock.fn(async () => 10000000000000000000n)
      mockGetTokenBalance = mock.fn(async () => 0n)
      mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.Success,
        assumedAmountOut: '2000000000000000000',
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
        estimateContractGas: mock.fn(async () => 100000n),
        estimateGas: mock.fn(async () => 200000n),
        getGasPrice: mock.fn(async () => 1000000000n), // 1 gwei
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
        startPrice: 1000000000000000000n,
        startTime: 0n, // No active auction
        funds: 500000000000000000n,
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
        startPrice: 1000000000000000000n,
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
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        funds: 500000000000000000n,
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
        assumedAmountOut: '100000000000000', // 0.0001 FIL - much less than cost
        tx: {
          to: sushiswapRouterAddress,
          data: '0xabcdef',
          value: 0n,
        },
      }))

      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 1000000000000000000n, // 1 FIL auction price
        startTime: 1700000000n,
        funds: 500000000000000000n,
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
      mockGetBalance = mock.fn(async () => 100000000000000n) // 0.0001 FIL - not enough

      const mockPublicClient = createProcessAuctionsMockClient({
        startPrice: 1000000000000000000n, // 1 FIL auction price
        startTime: 1700000000n,
        funds: 500000000000000000n,
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
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        funds: 500000000000000000n,
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
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        funds: 500000000000000000n,
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
  })
})
