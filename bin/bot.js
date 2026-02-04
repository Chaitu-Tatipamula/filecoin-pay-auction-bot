import 'dotenv/config'
import { setTimeout } from 'node:timers/promises'
import { discoverSushiswapRouter } from '../lib/swap.js'
import { initializeConfig, ensureApproval } from '../lib/config.js'
import { processAuctions } from '../lib/auction.js'

const config = await initializeConfig(process.env)
const sushiswapRouterAddress = await discoverSushiswapRouter({
  chainId: config.chainId,
  tokenIn: config.usdfcAddress,
  sender: config.account.address,
})

if (!sushiswapRouterAddress && config.chainId === 314) {
  console.error(
    'Error: Could not discover Sushiswap router address on Filecoin mainnet.',
  )
  process.exit(1)
}

if (sushiswapRouterAddress) {
  await ensureApproval({
    publicClient: config.publicClient,
    walletClient: config.walletClient,
    account: config.account,
    tokenAddress: config.usdfcAddress,
    spenderAddress: /** @type {import('viem').Address} */ (
      sushiswapRouterAddress
    ),
  })
}

console.log()
console.log('Starting auction monitoring...')
console.log()

while (true) {
  console.log(`Starting auction check...`)

  try {
    await processAuctions({ ...config, sushiswapRouterAddress })
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.log()
    console.error(`Error during auction check: ${err.message}`)
  }

  console.log(`Waiting ${config.delay}ms until next check...`)
  console.log()
  await setTimeout(config.delay)
}
