/**
 * Log transaction receipt details
 *
 * @param {string} label
 * @param {import("viem").TransactionReceipt} receipt
 */
export function logReceipt(label, receipt) {
  console.log();
  console.log(`${label}:`);
  console.log(`  Transaction hash: ${receipt.transactionHash}`);
  console.log(`  Block number: ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);
  console.log(
    `  Status: ${receipt.status === 'success' ? 'success' : 'failed'}`
  );
}
