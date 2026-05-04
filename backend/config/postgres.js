const { Sequelize } = require('sequelize');
const dns = require('dns');

// Supabase IPv6-only hosts need Node to try IPv6 first
dns.setDefaultResultOrder('verbatim');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('⚠️ DATABASE_URL not set — PostgreSQL features (Inventory) will be disabled.');
}

// Sequelize SQL logging is OFF by default — printing every query to the console
// is synchronous on Windows TTYs and noticeably slows request latency. Set
// SEQUELIZE_LOG=true to opt back in when debugging a specific query.
const sqlLogging = String(process.env.SEQUELIZE_LOG || '').toLowerCase() === 'true'
  ? console.log
  : false;

// Supabase (and most managed Postgres providers, plus any NAT/firewall in
// between) silently drop idle TCP connections. If Sequelize keeps those in
// the pool, the next request gets handed a dead socket and fails with
// "Connection terminated unexpectedly". We mitigate three ways:
//   1. min: 0 — don't keep warm connections sitting around to go stale.
//   2. idle/evict short — recycle quickly so a dropped conn doesn't linger.
//   3. TCP keepAlive on the pg socket — fights NAT idle timeouts.
// Plus retry on connection errors so a single dead socket doesn't fail the
// request; Sequelize will reconnect on the retry.
const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      logging: sqlLogging,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // pg client-level statement/connection timeouts so a stuck conn
        // surfaces as an error we can retry instead of hanging.
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 30000,
      },
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 5000,
        evict: 1000,
      },
      retry: {
        max: 3,
        match: [
          /SequelizeConnectionError/,
          /SequelizeConnectionRefusedError/,
          /SequelizeHostNotFoundError/,
          /SequelizeHostNotReachableError/,
          /SequelizeInvalidConnectionError/,
          /SequelizeConnectionTimedOutError/,
          /Connection terminated unexpectedly/,
          /ECONNRESET/,
          /EPIPE/,
        ],
      },
    })
  : null;

module.exports = sequelize;
