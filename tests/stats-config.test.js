import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { initializeStatsConfig } from '../lib/stats-config.js'

describe('stats-config', () => {
  describe('initializeStatsConfig', () => {
    it('throws error when INFLUXDB_URL is not provided', async () => {
      await assert.rejects(
        () =>
          initializeStatsConfig({
            RPC_URL: 'https://api.calibration.node.glif.io/',
            INFLUXDB_TOKEN: 'test-token',
            INFLUXDB_ORG: 'test-org',
            INFLUXDB_BUCKET: 'test-bucket',
          }),
        {
          message: 'INFLUXDB_URL environment variable is required',
        },
      )
    })

    it('throws error when INFLUXDB_TOKEN is not provided', async () => {
      await assert.rejects(
        () =>
          initializeStatsConfig({
            RPC_URL: 'https://api.calibration.node.glif.io/',
            INFLUXDB_URL: 'http://localhost:8086',
            INFLUXDB_ORG: 'test-org',
            INFLUXDB_BUCKET: 'test-bucket',
          }),
        {
          message: 'INFLUXDB_TOKEN environment variable is required',
        },
      )
    })

    it('throws error when INFLUXDB_ORG is not provided', async () => {
      await assert.rejects(
        () =>
          initializeStatsConfig({
            RPC_URL: 'https://api.calibration.node.glif.io/',
            INFLUXDB_URL: 'http://localhost:8086',
            INFLUXDB_TOKEN: 'test-token',
            INFLUXDB_BUCKET: 'test-bucket',
          }),
        {
          message: 'INFLUXDB_ORG environment variable is required',
        },
      )
    })

    it('throws error when INFLUXDB_BUCKET is not provided', async () => {
      await assert.rejects(
        () =>
          initializeStatsConfig({
            RPC_URL: 'https://api.calibration.node.glif.io/',
            INFLUXDB_URL: 'http://localhost:8086',
            INFLUXDB_TOKEN: 'test-token',
            INFLUXDB_ORG: 'test-org',
          }),
        {
          message: 'INFLUXDB_BUCKET environment variable is required',
        },
      )
    })
  })
})
