/**
 * TEDDY-XMD AutoPing — centralized environment configuration.
 *
 * Set these variables in Railway's Variables panel.
 * Do not put real credentials in this file or commit a .env file.
 */
export const config = Object.freeze({
  port: Number(process.env.PORT || 3000),

  // MongoDB Atlas / MongoDB connection
  mongodb: Object.freeze({
    uri: process.env.MONGODB_URI || '',
    database: process.env.MONGODB_DB || 'teddy_autoping'
  }),

  // External cron authentication
  cron: Object.freeze({
    secret: process.env.CRON_SECRET || ''
  }),

  // Monitor settings
  monitoring: Object.freeze({
    maxSitesPerRun: 100,
    requestTimeoutMs: 8000,
    historyDays: 30,
    historyLimit: 50,
    userAgent: 'TEDDY-XMD-AutoPing/1.2 (+uptime monitoring)'
  }),

  // Server security settings
  security: Object.freeze({
    jsonBodyLimit: '16kb'
  })
});

export function validateConfig() {
  const missing = [];
  if (!config.mongodb.uri) missing.push('MONGODB_URI');
  if (!config.cron.secret) missing.push('CRON_SECRET');
  if (missing.length) {
    console.warn(`[TEDDY-XMD AutoPing] Missing environment variables: ${missing.join(', ')}`);
  }
}
