# Filecoin Pay Auction Bot

A bot that participates in Filecoin Pay dutch auctions by monitoring active auctions and placing bids at regular intervals.

## Overview

This bot monitors ERC20 token auctions on the [Filecoin Pay](https://github.com/FilOzone/filecoin-pay) contract and automatically places bids using FIL. The auctions use a dutch auction mechanism where prices decay exponentially over time, halving every 3.5 days.

## Features

- Monitors USDFC token auction
- Sushiswap price checking for profitable bidding
- Only bids when market price > auction price
- Periodically places bids directly from wallet based on configurable intervals

## Requirements

- Node.js (v18 or higher recommended)
- FIL tokens on Filecoin Calibration testnet (or mainnet)
- Private key for signing transactions

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file or set environment variables:

### Required Variables

- `PRIVATE_KEY` - Wallet private key (with 0x prefix)

### Optional Variables

- `RPC_URL` - RPC endpoint (default: `https://api.calibration.node.glif.io/`). Chain is determined from the RPC.
- `DELAY` - Milliseconds between auction checks (default: `600000` = 10 minutes)

### Hardcoded Token Addresses

The bot monitors **USDFC** token only:

**USDFC**:

- Calibration: `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`
- Mainnet: `0x80B98d3aa09ffff255c3ba4A241111Ff1262F045`

**FIL** (Sushiswap quotes):

- Calibration & Mainnet: `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`

**Note:** Contract addresses are determined automatically by the SDK based on the chain ID. No manual contract address configuration is needed.

### Example .env file

```bash
RPC_URL=https://api.calibration.node.glif.io/
PRIVATE_KEY=0x1234567890abcdef...
DELAY=600000
```

## Usage

Start the bot:

```bash
npm start
```

The bot will:

1. Initialize and display wallet address and balance
2. Monitor USDFC token for active auction (using `@filoz/synapse-core` SDK)
3. Check if auction has available fees
4. Calculate auction price per token using SDK's `auctionPriceAt` function
5. Get Sushiswap quote for WFIL → USDFC on mainnet to determine market price
6. Compare market price vs auction price
7. Place a bid only if market price >= auction price and wallet has sufficient balance
8. Wait for configured delay before next check
9. Repeat indefinitely

## Development

### Run Tests

```bash
npm test
```

### Lint and Format

```bash
npm run lint:fix
```

### Project Structure

- [index.js](index.js) - Core library functions
- [bin/bot.js](bin/bot.js) - Main bot entry point
- [test/test.js](test/test.js) - Unit tests

## How It Works

### Dutch Auction Mechanism

Filecoin Pay uses dutch auctions where:

- Price starts at `startPrice` and decays exponentially
- Price halves every 3.5 days (302,400 seconds)
- Formula: `price = startPrice / 2^(elapsed / 3.5days)`

### Bot Logic

1. Query auction info for USDFC using SDK's `auctionInfo()`
2. Skip if no active auction (startTime = 0) or no available fees
3. Query available fees using SDK's `auctionFunds()`
4. Calculate auction price per token using SDK's `auctionPriceAt()` with current timestamp
5. **Get Sushiswap quote** for available fees in the auction.
6. **Compare profitability**: Only proceed if market price > auction price
7. Verify wallet has sufficient FIL balance
8. Place bid via `burnForFees(token, recipient, amount)` function

### SDK Integration

This bot uses the [`@filoz/synapse-core`](https://github.com/FilOzone/synapse-sdk) SDK for:

- **ABI definitions** - Imports canonical FilecoinPay ABI from SDK
- **Auction queries** - Uses `auctionInfo()` and `auctionFunds()` functions
- **Price calculation** - Uses `auctionPriceAt()` for accurate next-block pricing
- **Contract addresses** - Automatically resolved from chain ID via `getChain()`

FilecoinPay contract addresses used by SDK:

- Calibration (chain ID 314159): `0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0`
- Mainnet (chain ID 314): `0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa`

### Sushiswap Integration

The bot uses Sushiswap quote API to check market prices before bidding:

- **Quote pair**: USDFC → FIL (using the 0.05% slippage)
- **Quote network**: Always queries mainnet for accurate pricing (even when bidding on Calibration)
- **Profitability check**: Only bids when market price > auction price

This ensures the bot never overpays for tokens relative to their market value.

## License

See LICENSE file for details.
