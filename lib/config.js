import { ChainId } from 'sushi'
import { createClient, getChainId } from './client.js'
import { erc20Abi, maxUint256 } from 'viem'

/**
 * @import {
 *   Account,
 *   Address,
 *   PublicClient,
 *   TransactionReceipt,
 *   WalletClient
 * } from "viem"
 */

/**
 * @param {number} chainId
 * @returns {Address}
 */
export function getUsdfcAddress(chainId) {
  switch (chainId) {
    case 314:
      return '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045' // mainnet
    case 314159:
      return '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0' // calibration
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`)
  }
}

/**
 * Initialize bot configuration and clients
 *
 * @param {NodeJS.ProcessEnv} [env] - Environment variables
 * @returns {Promise<{
 *   publicClient: PublicClient
 *   walletClient: WalletClient
 *   account: Account
 *   walletAddress: Address
 *   usdfcAddress: Address
 *   usdfcAddressMainnet: Address
 *   chainId: 314 | 314159
 *   delay: number
 * }>}
 */
export async function initializeConfig(env = {}) {
  const {
    RPC_URL = 'https://api.calibration.node.glif.io/',
    PRIVATE_KEY,
    DELAY = 600000,
  } = env

  if (!PRIVATE_KEY) {
    throw new Error('Error: PRIVATE_KEY environment variable is required')
  }

  const chainId = await getChainId(RPC_URL)
  const usdfcAddress = getUsdfcAddress(chainId)
  const usdfcAddressMainnet = getUsdfcAddress(ChainId.FILECOIN)
  const isMainnet = chainId === 314

  console.log('Initializing auction bot...')
  console.log(`RPC URL: ${RPC_URL}`)
  console.log(`Network: ${isMainnet ? 'mainnet' : 'calibration'}`)
  console.log(`Monitoring token: USDFC at ${usdfcAddress}`)
  console.log(`Delay between bids: ${Number(DELAY)}ms`)
  console.log()

  const { publicClient, walletClient, account } = await createClient(
    chainId,
    RPC_URL,
    PRIVATE_KEY,
  )
  const walletAddress = account.address

  console.log(`Wallet address: ${walletAddress}`)
  console.log()
  console.log('Initialization complete.')

  return {
    publicClient,
    walletClient,
    account,
    walletAddress,
    usdfcAddress,
    usdfcAddressMainnet,
    chainId,
    delay: Number(DELAY),
  }
}

/**
 * Ensures that ERC-20 spender allowance is approved (uses max approval)
 *
 * @param {object} args
 * @param {PublicClient} args.publicClient
 * @param {WalletClient} args.walletClient
 * @param {Account} args.account
 * @param {Address} args.tokenAddress - USDFC token address
 * @param {Address} args.spenderAddress - Router address to approve
 * @returns {Promise<TransactionReceipt | null>}
 */
export async function ensureApproval({
  publicClient,
  walletClient,
  account,
  tokenAddress,
  spenderAddress,
}) {
  const currentAllowance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, spenderAddress],
  })

  if (currentAllowance === maxUint256) {
    console.log('USDFC already approved for Sushiswap router.')
    return null
  }

  console.log('Approving USDFC for Sushiswap router...')

  const { request } = await publicClient.simulateContract({
    account,
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spenderAddress, maxUint256],
  })

  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  console.log(
    `Approval successful! Transaction hash: ${receipt.transactionHash}`,
  )
  return receipt
}
