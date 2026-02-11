import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  extractChain,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration, filecoin } from 'viem/chains'
/**
 * @import {
 *   Account,
 *   Address,
 *   PublicClient,
 *   WalletClient
 * } from "viem"
 */

/**
 * @typedef {Object} Clients
 * @property {PublicClient} publicClient
 * @property {WalletClient} walletClient
 * @property {Account} account
 */

/**
 * @param {314 | 314159} chainId
 * @param {string} rpcUrl
 * @param {string} privateKey
 * @returns {Promise<Clients>}
 */
export async function createClient(chainId, rpcUrl, privateKey) {
  const chain = extractChain({
    chains: [filecoin, filecoinCalibration],
    id: chainId,
  })
  const account = privateKeyToAccount(/** @type {Address} */ (privateKey))

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  })

  return { publicClient, walletClient, account }
}

/**
 * @param {string} rpcUrl
 * @returns {Promise<314 | 314159>}
 */
export async function getChainId(rpcUrl) {
  const tempClient = createPublicClient({
    transport: http(rpcUrl),
  })

  return /** @type {314 | 314159} */ (await tempClient.getChainId())
}

/**
 * @param {PublicClient} publicClient
 * @param {string} address
 * @returns {Promise<bigint>}
 */
export async function getBalance(publicClient, address) {
  return await publicClient.getBalance({
    address: /** @type {Address} */ (address),
  })
}

/**
 * Get ERC20 token balance for a wallet
 *
 * @param {PublicClient} publicClient
 * @param {Address} tokenAddress
 * @param {Address} walletAddress
 * @returns {Promise<bigint>}
 */
export async function getTokenBalance(
  publicClient,
  tokenAddress,
  walletAddress,
) {
  return await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })
}
