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

## CLI Tool

For manual bidding, a CLI tool is also available:

### List Active Auctions

```bash
# Mainnet
npx auction-bidder list

# Calibration testnet
npx auction-bidder list --network calibration

# Check a specific token
npx auction-bidder list --network calibration --token 0x...
```

### Place a Bid

```bash
npx auction-bidder bid \
  --token 0xb3042... \
  --private-key 0x... \
  --network calibration
```

**Options:**

- `--token` (required) - Token address to bid on
- `--private-key` (required) - Bidder's private key
- `--amount` (optional) - Amount to request (default: all)
- `--pay` (optional) - FIL amount to pay (default: calculated price + 0.5% buffer)
- `--network` (optional) - `mainnet` or `calibration`
- `--rpc` (optional) - Custom RPC URL

## Kubernetes Deployment

The auction bot can be deployed to Kubernetes using the provided [kustomize](https://kustomize.io/) manifests. This approach is suitable for production deployments and provides better resource management, monitoring, and operational capabilities.

### Prerequisites

- [kubectl](https://kubernetes.io/docs/tasks/tools/) - Kubernetes command-line tool
- Access to a Kubernetes cluster (local via [kind](https://kind.sigs.k8s.io/)/[minikube](https://minikube.sigs.k8s.io/), or remote)
- [Docker](https://docs.docker.com/get-docker/) - Required only for local overlay

### Deployment Overlays

The repository includes three kustomize overlays for different environments:

| Overlay       | Use Case                  | Image                               | Network     | RPC URL                        |
| ------------- | ------------------------- | ----------------------------------- | ----------- | ------------------------------ |
| `local`       | Local development/testing | `auction-bot:local` (built locally) | Calibration | `api.calibration.node.glif.io` |
| `calibration` | Testnet deployment        | `filoz/auction-bot:latest`          | Calibration | `api.calibration.node.glif.io` |
| `mainnet`     | Production deployment     | `filoz/auction-bot:stable`          | Mainnet     | `api.node.glif.io`             |

### Configure Secrets

Before deploying, you must create and configure the wallet private key secret file for your target environment:

1. Copy the example secret file to create your actual secret file:

```bash
# For local deployment
cp kustomize/overlays/local/secret.yaml.example kustomize/overlays/local/secret.yaml

# For calibration deployment
cp kustomize/overlays/calibration/secret.yaml.example kustomize/overlays/calibration/secret.yaml

# For mainnet deployment
cp kustomize/overlays/mainnet/secret.yaml.example kustomize/overlays/mainnet/secret.yaml
```

2. Edit the secret file and replace `<PRIVATE_KEY>` with your actual private key (including `0x` prefix):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: auction-bot-secrets
  namespace: filecoin-pay-auction-bot
type: Opaque
stringData:
  PRIVATE_KEY: '0x1234567890abcdef...'
```

**Security Warning:**

- The `secret.yaml` file is in `.gitignore` and will never be committed
- Template files (`secret.yaml.example`) are safe to commit as they contain only placeholders
- For production deployments, consider using [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or [External Secrets Operator](https://external-secrets.io/)
- Alternatively, create secrets directly: `kubectl create secret generic auction-bot-secrets --from-literal=PRIVATE_KEY=0x... -n filecoin-pay-auction-bot`

### Deploy to Local Environment

For local development and testing:

1. Build the Docker image:

```bash
docker build -t auction-bot:local .
```

2. Configure the secret (see above)

3. Deploy to your local cluster:

```bash
kubectl apply -k kustomize/overlays/local
```

4. View logs:

```bash
kubectl logs -n filecoin-pay-auction-bot -l app.kubernetes.io/name=auction-bot -f
```

### Deploy to Calibration (Testnet)

For testnet deployment:

1. Configure the secret (see above)

2. Deploy to your cluster:

```bash
kubectl apply -k kustomize/overlays/calibration
```

3. Monitor the deployment:

```bash
kubectl get pods -n filecoin-pay-auction-bot -w
```

4. View logs:

```bash
kubectl logs -n filecoin-pay-auction-bot -l app.kubernetes.io/name=auction-bot -f
```

### Deploy to Mainnet (Production)

For production deployment:

1. Configure the secret (see above)

2. Review the configuration:
   - Uses stable image tag (`filoz/auction-bot:stable`)
   - Connects to mainnet RPC (`api.node.glif.io`)
   - Ensure wallet has sufficient FIL balance

3. Deploy to your cluster:

```bash
kubectl apply -k kustomize/overlays/mainnet
```

4. Monitor the deployment:

```bash
kubectl get pods -n filecoin-pay-auction-bot -w
```

5. View logs:

```bash
kubectl logs -n filecoin-pay-auction-bot -l app.kubernetes.io/name=auction-bot -f
```

### Common Operations

**Check pod status:**

```bash
kubectl get pods -n filecoin-pay-auction-bot
```

**View detailed pod information:**

```bash
kubectl describe pod -n filecoin-pay-auction-bot -l app.kubernetes.io/name=auction-bot
```

**Update configuration:**

Edit the configmap patch file, then reapply:

```bash
# Edit configuration
vi kustomize/overlays/{local|calibration|mainnet}/configmap-patch.yaml

# Apply changes
kubectl apply -k kustomize/overlays/{local|calibration|mainnet}

# Restart pod to pick up changes
kubectl rollout restart deployment/auction-bot -n filecoin-pay-auction-bot
```

**Delete deployment:**

```bash
kubectl delete -k kustomize/overlays/{local|calibration|mainnet}
```

**Delete namespace (removes all resources):**

```bash
kubectl delete namespace filecoin-pay-auction-bot
```

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
