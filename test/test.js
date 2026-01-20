import { describe, it } from 'node:test'
import assert from 'node:assert'
import { calculateMarketPrice } from '../uniswap.js'

describe('Uniswap integration', () => {
  describe('calculateMarketPrice', () => {
    it('calculates price correctly', () => {
      const amountOut = 950000000000000000n
      const amountIn = 1000000000000000000n
      const price = calculateMarketPrice(amountOut, amountIn)
      assert.strictEqual(price, 0n)
    })

    it('handles equal amounts', () => {
      const amountOut = 1000000000000000000n
      const amountIn = 1000000000000000000n
      const price = calculateMarketPrice(amountOut, amountIn)
      assert.strictEqual(price, 1n)
    })

    it('handles larger output amount', () => {
      const amountOut = 2000000000000000000n
      const amountIn = 1000000000000000000n
      const price = calculateMarketPrice(amountOut, amountIn)
      assert.strictEqual(price, 2n)
    })
  })
})
