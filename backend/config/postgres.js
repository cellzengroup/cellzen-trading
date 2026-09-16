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
// "Connection terminated unexpectedly". Two things keep that from reaching a
// request:
//   1. TCP keepAlive on the pg socket — fights NAT idle timeouts, so a kept
//      connection stays alive rather than going stale.
//   2. retry on connection errors (below, and withConnectionRetry in the
//      routes) — a socket that did die costs one reconnect, not a failure.
//
// The pool used to run min: 0 with a 5s idle timeout as a third guard, and that
// was the warehouse's slowest step: scans at a shelf come more than 5s apart, so
// nearly every put-away opened a brand-new TLS + SCRAM connection to the Seoul
// pooler first — about 450-900ms before its first query. Two connections are now
// kept warm (min: 2 — POST /items runs its reads in pairs) and idle ones live two
// minutes, so a steady scan pace always finds them. The pool is on Supabase's
// transaction pooler, where a couple of idle client connections per process cost
// next to nothing.
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
        min: 2,
        acquire: 30000,
        idle: 120000,
        evict: 10000,
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
