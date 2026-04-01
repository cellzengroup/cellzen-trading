require('dotenv').config();

module.exports = {
  // Server Configuration
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // MongoDB Configuration
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/cellzentrading',
  
  // CORS Configuration
  CORS_ORIGINS: process.env.CORS_ORIGINS || '',
};

