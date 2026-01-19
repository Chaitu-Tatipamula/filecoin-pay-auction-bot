import { describe, it } from 'node:test'
import assert from 'node:assert'
import { selectFirstAvailableAuction } from '../index.js'

describe('selectFirstAvailableAuction', () => {
  it('returns null for empty auctions array', () => {
    const auctions = []

    const selected = selectFirstAvailableAuction(auctions)

    assert.strictEqual(selected, null)
  })

  it('returns null when all auctions have zero fees', () => {
    const auctions = [
      {
        token: '0x1111111111111111111111111111111111111111',
        startPrice: 1000000000000000000n,
        startTime: 1000000n,
        availableFees: 0n,
      },
      {
        token: '0x2222222222222222222222222222222222222222',
        startPrice: 2000000000000000000n,
        startTime: 2000000n,
        availableFees: 0n,
      },
    ]

    const selected = selectFirstAvailableAuction(auctions)

    assert.strictEqual(selected, null)
  })

  it('returns first auction when it has available fees', () => {
    const auctions = [
      {
        token: '0x1111111111111111111111111111111111111111',
        startPrice: 1000000000000000000n,
        startTime: 1000000n,
        availableFees: 500000000000000000n,
      },
      {
        token: '0x2222222222222222222222222222222222222222',
        startPrice: 2000000000000000000n,
        startTime: 2000000n,
        availableFees: 300000000000000000n,
      },
    ]

    const selected = selectFirstAvailableAuction(auctions)

    assert.deepStrictEqual(selected, auctions[0])
  })

  it('returns first auction with fees when first auction has zero fees', () => {
    const auctions = [
      {
        token: '0x1111111111111111111111111111111111111111',
        startPrice: 1000000000000000000n,
        startTime: 1000000n,
        availableFees: 0n,
      },
      {
        token: '0x2222222222222222222222222222222222222222',
        startPrice: 2000000000000000000n,
        startTime: 2000000n,
        availableFees: 300000000000000000n,
      },
    ]

    const selected = selectFirstAvailableAuction(auctions)

    assert.deepStrictEqual(selected, auctions[1])
  })
})

describe('token address parsing', () => {
  it('parses comma-separated token addresses', () => {
    const TOKEN_ADDRESSES =
      '0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222'
    const tokenAddresses = TOKEN_ADDRESSES.split(',').map((addr) => addr.trim())

    assert.deepStrictEqual(tokenAddresses, [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ])
  })

  it('parses comma-separated token addresses with spaces', () => {
    const TOKEN_ADDRESSES =
      '0x1111111111111111111111111111111111111111 , 0x2222222222222222222222222222222222222222'
    const tokenAddresses = TOKEN_ADDRESSES.split(',').map((addr) => addr.trim())

    assert.deepStrictEqual(tokenAddresses, [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ])
  })

  it('parses single token address', () => {
    const TOKEN_ADDRESSES = '0x1111111111111111111111111111111111111111'
    const tokenAddresses = TOKEN_ADDRESSES.split(',').map((addr) => addr.trim())

    assert.deepStrictEqual(tokenAddresses, [
      '0x1111111111111111111111111111111111111111',
    ])
  })
})
