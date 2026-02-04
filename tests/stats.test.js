import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { RouteStatus } from 'sushi/evm'
import { collectAndReportStats } from '../lib/stats.js'

function createMockWriteApi() {
  const points = []
  return {
    writePoint: mock.fn((point) => points.push(point)),
    flush: mock.fn(async () => {}),
    _points: points,
  }
}

function createMockPublicClient(overrides = {}) {
  return {
    chain: { id: 314159 },
    getBlock: mock.fn(async () => ({ timestamp: 1700000100n })),
    ...overrides,
  }
}

describe('stats', () => {
  describe('collectAndReportStats', () => {
    const usdfcAddress = '0x3333333333333333333333333333333333333333'
    const usdfcAddressMainnet = '0x4444444444444444444444444444444444444444'

    it('records zeros when no active auction', async () => {
      const mockWriteApi = createMockWriteApi()
      const mockPublicClient = createMockPublicClient()
      const mockGetActiveAuction = mock.fn(async () => null)
      const mockGetSwapQuote = mock.fn()

      await collectAndReportStats(
        {
          publicClient: /** @type {any} */ (mockPublicClient),
          writeApi: /** @type {any} */ (mockWriteApi),
          usdfcAddress: /** @type {any} */ (usdfcAddress),
          usdfcAddressMainnet: /** @type {any} */ (usdfcAddressMainnet),
          chainId: 314159,
          network: 'calibration',
          interval: 60000,
        },
        {
          getActiveAuction: mockGetActiveAuction,
          getSwapQuote: mockGetSwapQuote,
        },
      )

      assert.equal(mockGetActiveAuction.mock.calls.length, 1)
      assert.equal(mockGetSwapQuote.mock.calls.length, 0)
      assert.equal(mockWriteApi.writePoint.mock.calls.length, 1)
      assert.equal(mockWriteApi.flush.mock.calls.length, 1)

      const point = mockWriteApi._points[0]
      assert.ok(point)
      assert.equal(point.name, 'auction_stats')
    })

    it('records auction data with successful swap quote', async () => {
      const mockWriteApi = createMockWriteApi()
      const mockPublicClient = createMockPublicClient()
      const mockGetActiveAuction = mock.fn(async () => ({
        token: usdfcAddress,
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        availableFees: 500000000000000000n,
      }))
      const mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.Success,
        assumedAmountOut: '2000000000000000000',
      }))

      await collectAndReportStats(
        {
          publicClient: /** @type {any} */ (mockPublicClient),
          writeApi: /** @type {any} */ (mockWriteApi),
          usdfcAddress: /** @type {any} */ (usdfcAddress),
          usdfcAddressMainnet: /** @type {any} */ (usdfcAddressMainnet),
          chainId: 314159,
          network: 'calibration',
          interval: 60000,
        },
        {
          getActiveAuction: mockGetActiveAuction,
          getSwapQuote: mockGetSwapQuote,
        },
      )

      assert.equal(mockGetActiveAuction.mock.calls.length, 1)
      assert.equal(mockGetSwapQuote.mock.calls.length, 1)
      assert.equal(mockPublicClient.getBlock.mock.calls.length, 1)
      assert.equal(mockWriteApi.writePoint.mock.calls.length, 1)
      assert.equal(mockWriteApi.flush.mock.calls.length, 1)

      const swapQuoteCall = mockGetSwapQuote.mock.calls[0]
      assert.ok(swapQuoteCall)
      assert.deepStrictEqual(swapQuoteCall.arguments[0], {
        tokenIn: usdfcAddressMainnet,
        tokenOut: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: 500000000000000000n,
        sender: '0x0000000000000000000000000000000000000001',
      })
    })

    it('records zero swap amount when swap quote fails', async () => {
      const mockWriteApi = createMockWriteApi()
      const mockPublicClient = createMockPublicClient()
      const mockGetActiveAuction = mock.fn(async () => ({
        token: usdfcAddress,
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        availableFees: 500000000000000000n,
      }))
      const mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.NoWay,
      }))

      await collectAndReportStats(
        {
          publicClient: /** @type {any} */ (mockPublicClient),
          writeApi: /** @type {any} */ (mockWriteApi),
          usdfcAddress: /** @type {any} */ (usdfcAddress),
          usdfcAddressMainnet: /** @type {any} */ (usdfcAddressMainnet),
          chainId: 314159,
          network: 'calibration',
          interval: 60000,
        },
        {
          getActiveAuction: mockGetActiveAuction,
          getSwapQuote: mockGetSwapQuote,
        },
      )

      assert.equal(mockGetActiveAuction.mock.calls.length, 1)
      assert.equal(mockGetSwapQuote.mock.calls.length, 1)
      assert.equal(mockWriteApi.writePoint.mock.calls.length, 1)
      assert.equal(mockWriteApi.flush.mock.calls.length, 1)
    })

    it('records zero swap amount when swap quote returns null', async () => {
      const mockWriteApi = createMockWriteApi()
      const mockPublicClient = createMockPublicClient()
      const mockGetActiveAuction = mock.fn(async () => ({
        token: usdfcAddress,
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        availableFees: 500000000000000000n,
      }))
      const mockGetSwapQuote = mock.fn(async () => null)

      await collectAndReportStats(
        {
          publicClient: /** @type {any} */ (mockPublicClient),
          writeApi: /** @type {any} */ (mockWriteApi),
          usdfcAddress: /** @type {any} */ (usdfcAddress),
          usdfcAddressMainnet: /** @type {any} */ (usdfcAddressMainnet),
          chainId: 314159,
          network: 'calibration',
          interval: 60000,
        },
        {
          getActiveAuction: mockGetActiveAuction,
          getSwapQuote: mockGetSwapQuote,
        },
      )

      assert.equal(mockWriteApi.writePoint.mock.calls.length, 1)
      assert.equal(mockWriteApi.flush.mock.calls.length, 1)
    })

    it('uses mainnet network tag for chain 314', async () => {
      const mockWriteApi = createMockWriteApi()
      const mockPublicClient = createMockPublicClient({ chain: { id: 314 } })
      const mockGetActiveAuction = mock.fn(async () => null)

      await collectAndReportStats(
        {
          publicClient: /** @type {any} */ (mockPublicClient),
          writeApi: /** @type {any} */ (mockWriteApi),
          usdfcAddress: /** @type {any} */ (usdfcAddress),
          usdfcAddressMainnet: /** @type {any} */ (usdfcAddressMainnet),
          chainId: 314,
          network: 'mainnet',
          interval: 60000,
        },
        {
          getActiveAuction: mockGetActiveAuction,
        },
      )

      assert.equal(mockWriteApi.writePoint.mock.calls.length, 1)
      const point = mockWriteApi._points[0]
      assert.ok(point)
      assert.equal(point.name, 'auction_stats')
    })
  })
})
