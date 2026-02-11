import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getQuote,
  discoverSushiswapRouter,
  SUSHISWAP_NATIVE_PLACEHOLDER,
} from '../lib/swap.js'

describe('swap', () => {
  describe('getQuote', () => {
    it('throws error for zero amount', async () => {
      await assert.rejects(
        () =>
          getQuote({
            tokenIn: '0x1234567890123456789012345678901234567890',
            tokenOut: '0x0987654321098765432109876543210987654321',
            amount: 0n,
          }),
        {
          message: 'Cannot get quote for zero amount',
        },
      )
    })
  })

  describe('discoverSushiswapRouter', () => {
    it('returns null for non-mainnet chains', async () => {
      const result = await discoverSushiswapRouter({
        chainId: 314159, // calibration
        tokenIn: '0x1234567890123456789012345678901234567890',
        sender: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      })

      assert.equal(result, null)
    })
  })

  describe('SUSHISWAP_NATIVE_PLACEHOLDER', () => {
    it('has correct value', () => {
      assert.equal(
        SUSHISWAP_NATIVE_PLACEHOLDER,
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      )
    })
  })
})
