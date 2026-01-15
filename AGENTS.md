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
- **JSDoc + TypeScript** - Type annotations in comments, TypeScript only for type checking
- **Node.js native test runner** - Uses `node:test` module

## Architecture

### Two-Layer Design

1. **Library Layer** ([index.js](index.js)) - Pure functions, all exported for testing
2. **Application Layer** ([bin/bot.js](bin/bot.js)) - Event loop with error handling

### Key Design Decisions

- **Stateless** - No database, queries contract fresh each iteration
- **Direct wallet bidding** - No account deposit needed
- **Deterministic auction selection** - Always picks first auction with available fees
- **100% bids** - Always bids for all available fees if balance is sufficient

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
- **Focus on pure functions** - Price calculations, auction selection, parsing

### Before Committing

1. Run `npm run lint:fix` to format code
2. Run `npm test` to verify all tests pass
3. Ensure no TypeScript errors

## Implementation Notes

### Price Decay Calculation

The exponential decay formula (`price = startPrice / 2^(elapsed / 3.5days)`) is implemented using:

- Integer division for full halving periods
- Linear interpolation for fractional periods using fixed-point math (multiply by 1000000)

### Contract Interaction

- Contract does NOT emit events - must poll `auctionInfo` mapping
- Available fees are stored in `accounts[token][contractAddress]`
- Bot bids directly via `burnForFees(token, recipient, amount)` with FIL as msg.value

### Environment Support

The `createClient` function supports both networks:

- `ENVIRONMENT=calibration` (default) - Uses filecoin calibration (testnet)
- `ENVIRONMENT=mainnet` - Uses filecoin mainnet
