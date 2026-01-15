import { describe, it } from 'node:test'
import assert from 'node:assert'
import { calculateCurrentPrice, selectFirstAvailableAuction } from '../index.js'

describe('calculateCurrentPrice', () => {
  it('returns startPrice when elapsed time is 0', () => {
    const startPrice = 1000000000000000000n
    const now = BigInt(Math.floor(Date.now() / 1000))
    const startTime = now

    const price = calculateCurrentPrice(startPrice, startTime)

    assert.strictEqual(price, startPrice)
  })

  it('returns approximately half of startPrice after 3.5 days', () => {
    const startPrice = 1000000000000000000n
    const now = BigInt(Math.floor(Date.now() / 1000))
    const startTime = now - 302400n

    const price = calculateCurrentPrice(startPrice, startTime)

    const expectedPrice = startPrice / 2n
    const tolerance = startPrice / 100n

    assert.ok(
      price >= expectedPrice - tolerance && price <= expectedPrice + tolerance,
      `Price ${price} should be approximately ${expectedPrice}`,
    )
  })

  it('returns approximately quarter of startPrice after 7 days', () => {
    const startPrice = 1000000000000000000n
    const now = BigInt(Math.floor(Date.now() / 1000))
    const startTime = now - 604800n

    const price = calculateCurrentPrice(startPrice, startTime)

    const expectedPrice = startPrice / 4n
    const tolerance = startPrice / 50n

    assert.ok(
      price >= expectedPrice - tolerance && price <= expectedPrice + tolerance,
      `Price ${price} should be approximately ${expectedPrice}`,
    )
  })

  it('returns startPrice when startTime is in the future', () => {
    const startPrice = 1000000000000000000n
    const now = BigInt(Math.floor(Date.now() / 1000))
    const startTime = now + 3600n

    const price = calculateCurrentPrice(startPrice, startTime)

    assert.strictEqual(price, startPrice)
  })
})

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
