import 'dotenv/config'
import { createServer } from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { initializeStatsConfig } from '../lib/stats-config.js'
import { collectAndUpdateStats } from '../lib/stats.js'

const config = await initializeStatsConfig(process.env)

const server = createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', config.registry.contentType)
    res.end(await config.registry.metrics())
  } else if (req.url === '/health') {
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  } else {
    res.statusCode = 404
    res.end('Not Found')
  }
})

server.listen(config.metricsPort, () => {
  console.log()
  console.log(`Metrics server listening on port ${config.metricsPort}`)
  console.log(`  /metrics - Prometheus metrics`)
  console.log(`  /health  - Health check`)
  console.log()
  console.log('Starting auction stats reporter...')
  console.log()
})

const shutdown = () => {
  console.log('Shutting down...')
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

while (true) {
  try {
    await collectAndUpdateStats(config)
  } catch (error) {
    const err = /** @type {Error} */ (error)
    console.error(`Error collecting stats: ${err.message}`)
  }

  console.log(`Waiting ${config.interval}ms until next stats collection...`)
  console.log()
  await setTimeout(config.interval)
}
