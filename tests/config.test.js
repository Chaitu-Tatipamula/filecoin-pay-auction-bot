import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { erc20Abi, maxUint256 } from 'viem'
import {
  getUsdfcAddress,
  initializeConfig,
  ensureApproval,
} from '../lib/config.js'

describe('config', () => {
  describe('getUsdfcAddress', () => {
    it('returns mainnet address for chain ID 314', () => {
      const address = getUsdfcAddress(314)
      assert.equal(address, '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045')
    })

    it('returns calibration address for chain ID 314159', () => {
      const address = getUsdfcAddress(314159)
      assert.equal(address, '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0')
    })

    it('throws error for unsupported chain ID', () => {
      assert.throws(() => getUsdfcAddress(1), {
        message: 'Unsupported chain ID: 1',
      })
    })
  })

  describe('initializeConfig', () => {
    it('throws error when PRIVATE_KEY is not provided', async () => {
      await assert.rejects(() => initializeConfig({}), {
        message: 'Error: PRIVATE_KEY environment variable is required',
      })
    })
  })

  describe('ensureApproval', () => {
    it('returns null when already approved with max allowance', async () => {
      const readContract = mock.fn(async () => maxUint256)
      const mockPublicClient = { readContract }
      const mockWalletClient = {}
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111',
      }

      const result = await ensureApproval({
        publicClient: /** @type {any} */ (mockPublicClient),
        walletClient: /** @type {any} */ (mockWalletClient),
        account: /** @type {any} */ (mockAccount),
        tokenAddress: '0xtoken0000000000000000000000000000000000',
        spenderAddress: '0xspender00000000000000000000000000000000',
      })

      assert.equal(result, null)
      assert.equal(readContract.mock.calls.length, 1)

      const call = readContract.mock.calls[0]
      assert.ok(call)
      assert.deepEqual(call.arguments, [
        {
          address: '0xtoken0000000000000000000000000000000000',
          abi: erc20Abi,
          functionName: 'allowance',
          args: [
            '0x1111111111111111111111111111111111111111',
            '0xspender00000000000000000000000000000000',
          ],
        },
      ])
    })

    it('approves when allowance is not max', async () => {
      const tokenAddress = '0xtoken0000000000000000000000000000000000'
      const spenderAddress = '0xspender00000000000000000000000000000000'
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111',
      }
      const expectedReceipt = {
        transactionHash: '0xapproval1234',
        status: 'success',
      }

      let capturedRequest
      const readContract = mock.fn(async () => 0n)
      const simulateContract = mock.fn(async (params) => {
        capturedRequest = params
        return { request: params }
      })
      const waitForTransactionReceipt = mock.fn(async () => expectedReceipt)
      const mockPublicClient = {
        readContract,
        simulateContract,
        waitForTransactionReceipt,
      }
      const writeContract = mock.fn(async () => '0xapproval1234')
      const mockWalletClient = { writeContract }

      const result = await ensureApproval({
        publicClient: /** @type {any} */ (mockPublicClient),
        walletClient: /** @type {any} */ (mockWalletClient),
        account: /** @type {any} */ (mockAccount),
        tokenAddress,
        spenderAddress,
      })

      assert.deepStrictEqual(result, expectedReceipt)
      assert.equal(simulateContract.mock.calls.length, 1)
      assert.equal(writeContract.mock.calls.length, 1)
      assert.equal(waitForTransactionReceipt.mock.calls.length, 1)

      const expectedRequest = {
        account: mockAccount,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spenderAddress, maxUint256],
      }
      assert.deepStrictEqual(capturedRequest, expectedRequest)

      const writeCall = writeContract.mock.calls[0]
      assert.ok(writeCall)
      assert.deepStrictEqual(writeCall.arguments, [expectedRequest])

      const receiptCall = waitForTransactionReceipt.mock.calls[0]
      assert.ok(receiptCall)
      assert.deepStrictEqual(receiptCall.arguments, [
        { hash: '0xapproval1234' },
      ])
    })
  })
})
