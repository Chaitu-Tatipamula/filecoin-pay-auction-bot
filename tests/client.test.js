import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { erc20Abi } from 'viem'
import { getBalance, getTokenBalance } from '../lib/client.js'

describe('client', () => {
  describe('getBalance', () => {
    it('calls publicClient.getBalance with correct address', async () => {
      const expectedBalance = 1n
      const getBalanceFn = mock.fn(async () => expectedBalance)
      const mockPublicClient = { getBalance: getBalanceFn }

      const balance = await getBalance(
        /** @type {any} */ (mockPublicClient),
        '0x1234567890123456789012345678901234567890',
      )

      assert.equal(balance, expectedBalance)
      assert.equal(getBalanceFn.mock.calls.length, 1)

      const call = getBalanceFn.mock.calls[0]
      assert.ok(call)
      assert.deepEqual(call.arguments, [
        { address: '0x1234567890123456789012345678901234567890' },
      ])
    })
  })

  describe('getTokenBalance', () => {
    it('calls readContract with correct parameters for balanceOf', async () => {
      const expectedBalance = 5n
      const readContract = mock.fn(async () => expectedBalance)
      const mockPublicClient = { readContract }

      const balance = await getTokenBalance(
        /** @type {any} */ (mockPublicClient),
        '0xtoken0000000000000000000000000000000000',
        '0xwallet000000000000000000000000000000000',
      )

      assert.equal(balance, expectedBalance)
      assert.equal(readContract.mock.calls.length, 1)

      const call = readContract.mock.calls[0]
      assert.ok(call)
      assert.deepEqual(call.arguments, [
        {
          address: '0xtoken0000000000000000000000000000000000',
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: ['0xwallet000000000000000000000000000000000'],
        },
      ])
    })
  })
})
