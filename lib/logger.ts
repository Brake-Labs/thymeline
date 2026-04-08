import 'server-only'
import pino from 'pino'

// Note: pino's `transport` option spawns a worker thread which breaks under
// Next.js webpack bundling. Instead, write JSON to stdout and pipe through
// pino-pretty externally in dev: `npm run dev | npx pino-pretty`
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
})
