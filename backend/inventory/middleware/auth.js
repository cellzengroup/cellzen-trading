const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'cellzentrading-default-secret';

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// In-memory user cache keyed by user id. The JWT signature is already verified
// before we look up the cache, so a hit means the request is authenticated.
// This eliminates a DB roundtrip on every authenticated API call.
const userCache = new Map(); // id -> { user, expiry }
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const invalidateUserCache = (id) => {
  if (id == null) userCache.clear();
  else userCache.delete(id);
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fast path: serve from cache (skip DB roundtrip)
    const cached = userCache.get(decoded.id);
    if (cached && Date.now() < cached.expiry) {
      req.user = cached.user;
      return next();
    }

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    userCache.set(decoded.id, { user, expiry: Date.now() + USER_CACHE_TTL });
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

module.exports = { authenticate, generateToken, invalidateUserCache, JWT_SECRET };
