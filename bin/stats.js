import 'dotenv/config'
import { setTimeout } from 'node:timers/promises'
import { initializeStatsConfig } from '../lib/stats-config.js'
import { collectAndReportStats } from '../lib/stats.js'

const config = await initializeStatsConfig(process.env)

console.log()
console.log('Starting auction stats reporter...')
console.log()

while (true) {
  try {
    await collectAndReportStats(config)
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.error(`Error collecting stats: ${err.message}`)
  }

  console.log(`Waiting ${config.interval}ms until next report...`)
  console.log()
  await setTimeout(config.interval)
}
