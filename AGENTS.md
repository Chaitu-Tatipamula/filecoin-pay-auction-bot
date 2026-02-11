# CLAUDE.md

This file provides guidance to Claude Code when working with this codebase.

For user-facing documentation, see [README.md](README.md).

## Development Workflow

```bash
npm run lint:fix        # Always run before committing
npm test                # Run linter + unit tests
npm run test:unit       # Run only unit tests
```

## Technology Stack

- **Node.js with ES modules** - No compilation step
- **Viem** - Blockchain interactions
- **@filoz/synapse-core** - FilecoinPay SDK for contract interactions
- **JSDoc + TypeScript** - Type annotations in comments, TypeScript only for type checking
- **Node.js native test runner** - Uses `node:test` module

### Key Design Decisions

- **Stateless** - No database, queries contract fresh each iteration
- **Direct wallet bidding** - No account deposit needed
- **Deterministic auction selection** - Always picks first auction with available fees
- **100% bids** - Always bids for all available fees if balance is sufficient
- **Auto-refuel** - Swaps acquired USDFC back to FIL after successful bids (mainnet only)

## Coding Conventions

### Code Style

- **Simplicity over cleverness** - Straightforward implementations
- **Minimal comments** - Only explain complex logic
- **JSDoc for all exported functions** - Parameter and return types required
- **BigInt for amounts** - All token amounts and prices use bigint

### Viem Type Assertions

- Use `/** @type {`0x${string}`} */` for address casts
- Use `// @ts-expect-error` with explanation for known type issues

### Testing

- **Test full objects/arrays** - Use `assert.deepStrictEqual(value, expected)` instead of testing individual properties
- **Focus on business logic** - Test auction selection and parsing functions
- **SDK functions not tested** - Price calculations and contract queries are handled by `@filoz/synapse-core`

### Before Committing

1. Run `npm run lint:fix` to format code
2. Run `npm test` to verify all tests pass
3. Ensure no TypeScript errors

## Implementation Notes

### SDK Integration

The bot uses `@filoz/synapse-core` SDK for all FilecoinPay contract interactions:

- **ABI**: Imported from `@filoz/synapse-core/abis` (payments)
- **Auction queries**: Uses `auctionInfo()` and `auctionFunds()` from `@filoz/synapse-core/auction`
- **Price calculation**: Uses `auctionPriceAt()` with next block timestamp (`block.timestamp + 30n`)
- **Contract addresses**: Resolved via `getChain()` from `@filoz/synapse-core/chains`

The SDK implements the exponential decay formula: `price = startPrice / 2^(elapsed / 3.5days)`

- Price halves every 3.5 days (HALVING_SECONDS constant)
- Bot uses next block timestamp for accurate pricing
- Uses `auctionPriceAt(auction, block.timestamp + 30n)` for 30s block time

### Contract Interaction

- Contract does NOT emit events - must poll using SDK's `auctionInfo()`
- Available fees queried via SDK's `auctionFunds()`
- Bot bids directly via `burnForFees(token, recipient, amount)` with FIL as msg.value
- Uses `simulateContract()` before `writeContract()` for safety

### Environment Support

The `createClient` function supports both networks: `mainnet` and `calibration`. Network is determined by passing the `RPC_URL` to `createClient`. The function will automatically detect the chain and configure the client accordingly.

### Sushiswap Integration

The bot uses Sushiswap's SDK for swap quoting.

#### Frontrunning Protection (Nonce+1)

To reduce the frontrunning window, both `burnForFees` and swap transactions are submitted simultaneously:

1. Get current nonce N
2. Submit `burnForFees` with nonce N
3. Immediately submit swap with nonce N+1 (don't wait for bid confirmation)
4. Wait for both receipts in parallel

This ensures both transactions hit the mempool together. If `burnForFees` fails, the swap should also fail due to nonce ordering.

#### Flow on Mainnet

1. At startup: Discover Sushiswap router → Approve USDFC for router
2. Each iteration: Get balances → Get auction info → Get swap quote → Check profitability → Submit bid+swap simultaneously (nonce+1)

#### Error Handling

- If bid+swap both fail, USDFC (if any) is held for next iteration
- Quote failures skip the auction (no bid placed)
- If bid succeeds but swap fails, USDFC held for next iteration
