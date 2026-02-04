import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  getSwapQuote,
  discoverSushiswapRouter,
  executeSwap,
  SUSHISWAP_NATIVE_PLACEHOLDER,
} from '../lib/swap.js'

describe('swap', () => {
  describe('getSwapQuote', () => {
    it('throws error for zero amount', async () => {
      await assert.rejects(
        () =>
          getSwapQuote({
            tokenIn: '0x1234567890123456789012345678901234567890',
            tokenOut: '0x0987654321098765432109876543210987654321',
            amount: 0n,
            sender: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          }),
        {
          message: 'Cannot get swap quote for zero amount',
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

  describe('executeSwap', () => {
    it('sends transaction with correct parameters', async () => {
      const expectedHash = '0xabcd1234'
      const sendTransaction = mock.fn(async () => expectedHash)
      const mockWalletClient = { sendTransaction }
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111',
      }
      const swapTx = {
        to: /** @type {`0x${string}`} */ (
          '0x2222222222222222222222222222222222222222'
        ),
        data: /** @type {`0x${string}`} */ ('0x1234'),
        value: 1000n,
      }

      const hash = await executeSwap({
        walletClient: /** @type {any} */ (mockWalletClient),
        account: /** @type {any} */ (mockAccount),
        swapTx,
        nonce: 5,
      })

      assert.equal(hash, expectedHash)
      assert.equal(sendTransaction.mock.calls.length, 1)

      const call = sendTransaction.mock.calls[0]
      assert.ok(call)
      assert.deepEqual(call.arguments, [
        {
          account: mockAccount,
          to: '0x2222222222222222222222222222222222222222',
          data: '0x1234',
          value: 1000n,
          nonce: 5,
        },
      ])
    })

    it('sends transaction without nonce when not provided', async () => {
      const expectedHash = '0xabcd1234'
      const sendTransaction = mock.fn(async () => expectedHash)
      const mockWalletClient = { sendTransaction }
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111',
      }
      const swapTx = {
        to: /** @type {`0x${string}`} */ (
          '0x2222222222222222222222222222222222222222'
        ),
        data: /** @type {`0x${string}`} */ ('0x1234'),
        value: 1000n,
      }

      await executeSwap({
        walletClient: /** @type {any} */ (mockWalletClient),
        account: /** @type {any} */ (mockAccount),
        swapTx,
      })

      const call = sendTransaction.mock.calls[0]
      assert.ok(call)
      assert.deepEqual(call.arguments, [
        {
          account: mockAccount,
          to: '0x2222222222222222222222222222222222222222',
          data: '0x1234',
          value: 1000n,
          nonce: undefined,
        },
      ])
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
