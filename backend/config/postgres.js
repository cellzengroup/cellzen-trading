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

const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      logging: sqlLogging,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: 10,
        min: 2,           // keep warm connections to avoid cold-connect latency to Supabase
        acquire: 30000,
        idle: 10000,
        evict: 30000,
      },
      retry: { max: 3 },
    })
  : null;

module.exports = sequelize;
