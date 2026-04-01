# Yogini Arts Backend API

Simple backend API server for Yogini Arts website - handles form submissions only.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

3. Update `.env` with your MongoDB URI:
   - Local: `mongodb://localhost:27017/yoginiarts`
   - MongoDB Atlas: `mongodb+srv://username:password@cluster.mongodb.net/yoginiarts`

4. Start MongoDB (if using local):
```bash
# Make sure MongoDB is running locally
# Or use MongoDB Atlas cloud service
```

5. Start the server:
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## API Endpoints

### Forms
- `POST /api/forms/thangka` - Submit Thangka form
- `POST /api/forms/soundBowls` - Submit Sound Bowls form
- `POST /api/forms/sacredItems` - Submit Sacred Items form
- `POST /api/forms/contact` - Submit Contact form
- `GET /api/forms/submission/:token` - Get submission by token
- `GET /api/forms/submissions/:formType` - Get submissions by type
- `GET /api/forms/health` - Health check

## Environment Variables

- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `MONGO_URI` - MongoDB connection string
- `CORS_ORIGINS` - Comma-separated list of allowed origins (optional)

## MongoDB

The server requires MongoDB to store form submissions. You can use:
- Local MongoDB installation
- MongoDB Atlas (cloud)

## Default Port

The server runs on port 5000 by default. Change it in `.env` if needed.

