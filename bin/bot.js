import 'dotenv/config'
import { setTimeout } from 'node:timers/promises'
import { initializeConfig, processAuctions } from '../index.js'

const config = await initializeConfig(process.env)

while (true) {
  console.log(`Starting auction check...`)

  try {
    await processAuctions(config)
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.log()
    console.error(`Error during auction check: ${err.message}`)
  }

  console.log(`Waiting ${config.delay}ms until next check...`)
  console.log()
  await setTimeout(config.delay)
}
