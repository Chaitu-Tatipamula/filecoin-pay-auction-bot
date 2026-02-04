import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Registry, Gauge } from 'prom-client'
import { RouteStatus } from 'sushi/evm'
import { collectAndUpdateStats } from '../lib/stats.js'

function createConfig(overrides = {}) {
  const registry = new Registry()

  const poolBalanceGauge = new Gauge({
    name: 'auction_pool_balance',
    help: 'Available fees in the auction pool',
    labelNames: ['network', 'token'],
    registers: [registry],
  })

  const auctionPriceGauge = new Gauge({
    name: 'auction_price',
    help: 'Current auction price (attoFIL)',
    labelNames: ['network', 'token'],
    registers: [registry],
  })

  const swapAmountOutGauge = new Gauge({
    name: 'auction_swap_amount_out',
    help: 'Estimated swap output for available fees (attoFIL)',
    labelNames: ['network', 'token'],
    registers: [registry],
  })

  return {
    publicClient: {
      chain: { id: 314159 },
      getBlock: mock.fn(async () => ({ timestamp: 1700000100n })),
    },
    registry,
    poolBalanceGauge,
    auctionPriceGauge,
    swapAmountOutGauge,
    usdfcAddress: '0x3333333333333333333333333333333333333333',
    usdfcAddressMainnet: '0x4444444444444444444444444444444444444444',
    chainId: 314159,
    network: 'calibration',
    interval: 60000,
    ...overrides,
  }
}

describe('stats', () => {
  describe('collectAndUpdateStats', () => {
    it('records zeros when no active auction', async () => {
      const config = createConfig()
      const mockGetActiveAuction = mock.fn(async () => null)

      await collectAndUpdateStats(/** @type {any} */ (config), {
        getActiveAuction: mockGetActiveAuction,
      })

      const metrics = await config.registry.metrics()
      assert.ok(
        metrics.includes(
          'auction_pool_balance{network="calibration",token="USDFC"} 0',
        ),
      )
      assert.ok(
        metrics.includes(
          'auction_price{network="calibration",token="USDFC"} 0',
        ),
      )
      assert.ok(
        metrics.includes(
          'auction_swap_amount_out{network="calibration",token="USDFC"} 0',
        ),
      )
    })

    it('records auction data with successful swap quote', async () => {
      const config = createConfig()
      const mockGetActiveAuction = mock.fn(async () => ({
        token: config.usdfcAddress,
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        availableFees: 500000000000000000n,
      }))
      const mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.Success,
        assumedAmountOut: '2000000000000000000',
      }))

      await collectAndUpdateStats(/** @type {any} */ (config), {
        getActiveAuction: mockGetActiveAuction,
        getSwapQuote: mockGetSwapQuote,
      })

      const metrics = await config.registry.metrics()
      assert.ok(
        metrics.includes(
          'auction_pool_balance{network="calibration",token="USDFC"} 500000000000000000',
        ),
      )
      assert.ok(
        metrics.includes('auction_price{network="calibration",token="USDFC"}'),
      )
      assert.ok(
        metrics.includes(
          'auction_swap_amount_out{network="calibration",token="USDFC"} 2000000000000000000',
        ),
      )
    })

    it('records zero swap amount when swap quote fails', async () => {
      const config = createConfig()
      const mockGetActiveAuction = mock.fn(async () => ({
        token: config.usdfcAddress,
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        availableFees: 500000000000000000n,
      }))
      const mockGetSwapQuote = mock.fn(async () => ({
        status: RouteStatus.NoWay,
      }))

      await collectAndUpdateStats(/** @type {any} */ (config), {
        getActiveAuction: mockGetActiveAuction,
        getSwapQuote: mockGetSwapQuote,
      })

      const metrics = await config.registry.metrics()
      assert.ok(
        metrics.includes(
          'auction_pool_balance{network="calibration",token="USDFC"} 500000000000000000',
        ),
      )
      assert.ok(
        metrics.includes(
          'auction_swap_amount_out{network="calibration",token="USDFC"} 0',
        ),
      )
    })

    it('records zero swap amount when swap quote returns null', async () => {
      const config = createConfig()
      const mockGetActiveAuction = mock.fn(async () => ({
        token: config.usdfcAddress,
        startPrice: 1000000000000000000n,
        startTime: 1700000000n,
        availableFees: 500000000000000000n,
      }))
      const mockGetSwapQuote = mock.fn(async () => null)

      await collectAndUpdateStats(/** @type {any} */ (config), {
        getActiveAuction: mockGetActiveAuction,
        getSwapQuote: mockGetSwapQuote,
      })

      const metrics = await config.registry.metrics()
      assert.ok(
        metrics.includes(
          'auction_swap_amount_out{network="calibration",token="USDFC"} 0',
        ),
      )
    })

    it('uses mainnet network label for mainnet config', async () => {
      const config = createConfig({ network: 'mainnet', chainId: 314 })
      const mockGetActiveAuction = mock.fn(async () => null)

      await collectAndUpdateStats(/** @type {any} */ (config), {
        getActiveAuction: mockGetActiveAuction,
      })

      const metrics = await config.registry.metrics()
      assert.ok(
        metrics.includes(
          'auction_pool_balance{network="mainnet",token="USDFC"} 0',
        ),
      )
    })
  })
})
