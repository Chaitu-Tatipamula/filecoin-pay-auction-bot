/** @import {Address} from "viem" */

export const CHAIN_ID_MAINNET = 314
export const CHAIN_ID_CALIBRATION = 314159

export const RPC_URLS = {
  [CHAIN_ID_MAINNET]: 'https://api.node.glif.io/',
  [CHAIN_ID_CALIBRATION]: 'https://api.calibration.node.glif.io/',
}

/**
 * Known token addresses and their symbols for display purposes
 *
 * @type {Record<Address, string>}
 */
export const KNOWN_TOKENS = {
  '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0': 'USDFC', // Calibration
  '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045': 'USDFC', // Mainnet
}
