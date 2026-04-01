const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config/environment');
const { errorHandler, notFoundHandler } = require('./middleware/validation');

// Import routes
const formsRoutes = require('./routes/forms');
const inventoryRoutes = require('./inventory/routes');
const sequelize = require('./config/postgres');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow for development; configure properly for production
  // Allow embedding cross-origin images like Cloudinary in development
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration
const isProduction = process.env.NODE_ENV === 'production';
const defaultProdOrigins = [
  'https://cellzen-trading.onrender.com',
  'https://www.cellzen.com.np'
];

const defaultDevOrigins = [
  'http://localhost:3300', 'http://localhost:3001', 'http://localhost:5173',
  'http://127.0.0.1:3300', 'http://127.0.0.1:5173'
];

const envOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : null;

const baseAllowedOrigins = envOrigins || (isProduction ? defaultProdOrigins : defaultDevOrigins);

// CORS origin function to allow Render subdomains
const corsOrigin = (origin, callback) => {
  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) return callback(null, true);
  
  // Check if origin is in the allowed list
  if (baseAllowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  
  // Allow all Render subdomains
  if (origin.endsWith('.onrender.com')) {
    return callback(null, true);
  }
  
  // Reject other origins
  callback(new Error('Not allowed by CORS'));
};

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

// Explicitly handle preflight requests with correct CORS headers
app.options('*', cors({
  origin: corsOrigin,
  credentials: true
}));

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Serve uploaded files (product images etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files when dist exists (production builds)
const distPath = path.join(__dirname, '..', 'dist');
const fs = require('fs');
const distExists = fs.existsSync(distPath);
if (isProduction || distExists) {
  app.use(express.static(distPath));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Cellzen Trading Backend is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/forms', formsRoutes);
app.use('/api/inventory', inventoryRoutes);

// Catch-all route — serve frontend index.html for non-API routes when dist exists
app.all('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  if ((isProduction || distExists) && fs.existsSync(path.join(distPath, 'index.html'))) {
    return res.sendFile(path.join(distPath, 'index.html'));
  }
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found. This is an API-only server.`
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

// Database connection
const connectDB = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    
    await mongoose.connect(config.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB connected successfully');
    
    // Log database name
    console.log(`📊 Database: ${mongoose.connection.name}`);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('🔄 Server will continue without MongoDB (some features disabled)');
    console.log('💡 To enable full functionality, please ensure MongoDB is running');
  }
};

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (sequelize) {
    sequelize.close().then(() => console.log('📊 PostgreSQL connection closed'));
  }
  mongoose.connection.close(() => {
    console.log('📊 MongoDB connection closed');
    process.exit(0);
  });
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async () => {
  await connectDB();

  // Connect to PostgreSQL (Inventory system)
  if (sequelize) {
    try {
      await sequelize.authenticate();
      console.log('✅ PostgreSQL connected successfully');
      await sequelize.sync({ alter: true });
      console.log('📊 Inventory tables synced');
    } catch (pgError) {
      console.error('❌ PostgreSQL connection failed:', pgError.message);
      console.log('🔄 Server will continue without PostgreSQL (Inventory features disabled)');
    }
  }

  const server = app.listen(config.PORT, () => {
    console.log(`\n🚀 Server running on port ${config.PORT}`);
    console.log(`📱 Environment: ${config.NODE_ENV}`);
    console.log(`🌐 Local: http://localhost:${config.PORT}`);
    console.log(`📋 API Docs: http://localhost:${config.PORT}/api/forms/health`);
    
    console.log('\n📝 Available Endpoints:');
    console.log('   POST /api/forms/thangka - Submit Thangka form');
    console.log('   POST /api/forms/soundBowls - Submit Sound Bowls form');
    console.log('   POST /api/forms/sacredItems - Submit Sacred Items form');
    console.log('   POST /api/forms/contact - Submit Contact form');
    console.log('   GET  /api/forms/submission/:token - Get submission by token');
    console.log('   GET  /api/forms/submissions/:formType - Get submissions by type');
    console.log('\n✨ Ready to accept form submissions!');
  });
  
  // Handle server errors
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${config.PORT} is already in use`);
    } else {
      console.error('❌ Server error:', error);
    }
    process.exit(1);
  });
};

// Initialize everything
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

module.exports = app;

