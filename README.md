# Filecoin Pay Auction Bot

A bot that participates in Filecoin Pay dutch auctions by monitoring active auctions and placing bids at regular intervals.

## Overview

This bot monitors ERC20 token auctions on the [Filecoin Pay](https://github.com/FilOzone/filecoin-pay) contract and automatically places bids using FIL. The auctions use a dutch auction mechanism where prices decay exponentially over time, halving every 3.5 days.

## Features

- Monitors multiple ERC20 token auctions simultaneously
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
- `RECIPIENT` - Address to receive withdrawn tokens
- `TOKEN_ADDRESSES` - Comma-separated ERC20 token addresses to monitor

### Optional Variables

- `ENVIRONMENT` - Network environment: `calibration` (default) or `mainnet`
- `RPC_URL` - RPC endpoint (default: `https://api.calibration.node.glif.io/`)
- `CONTRACT_ADDRESS` - FilecoinPayV1 contract address (default: `0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0`)
- `DELAY` - Milliseconds between auction checks (default: `3600000` = 1 hour)

### Example .env file

```bash
ENVIRONMENT=calibration
PRIVATE_KEY=0x1234567890abcdef...
RECIPIENT=0xYourRecipientAddress
TOKEN_ADDRESSES=0xToken1Address,0xToken2Address
DELAY=3600000
```

## Usage

Start the bot:

```bash
npm start
```

The bot will:

1. Initialize and display wallet address and balance
2. Monitor specified token addresses for active auctions
3. Select the first auction with available fees
4. Calculate current price based on auction start time
5. Place a bid if wallet has sufficient balance
6. Wait for configured delay before next check
7. Repeat indefinitely

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
- [FilecoinPayV1.abi.json](FilecoinPayV1.abi.json) - Contract ABI

## How It Works

### Dutch Auction Mechanism

Filecoin Pay uses dutch auctions where:

- Price starts at `startPrice` and decays exponentially
- Price halves every 3.5 days (302,400 seconds)
- Formula: `price = startPrice / 2^(elapsed / 3.5days)`

### Bot Logic

1. Query `auctionInfo` mapping for each token address
2. Filter out tokens with no active auction (startTime = 0)
3. Query `accounts` mapping to get available fees for each auction
4. Select first auction with available fees > 0
5. Calculate current price using decay formula
6. Place bid via `burnForFees(token, recipient, amount)` function
7. Bot bids for available fees only if balance is sufficient

## License

See LICENSE file for details.
