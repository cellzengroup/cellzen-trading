const { Sequelize } = require('sequelize');
const dns = require('dns');

// Supabase IPv6-only hosts need Node to try IPv6 first
dns.setDefaultResultOrder('verbatim');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('⚠️ DATABASE_URL not set — PostgreSQL features (Inventory) will be disabled.');
}

const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
        evict: 30000,
      },
      retry: { max: 3 },
    })
  : null;

module.exports = sequelize;
