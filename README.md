# Cellzen Trading – International Goods Export & Logistics Platform

Cellzen Trading is the core supplier for exporting goods to multiple countries. The platform manages product listings, export orders, shipment tracking, and customer inquiries with a clean modern interface.

## Company Overview

Cellzen Trading supplies goods and exports them globally. This repository contains the code that powers:

- product and order management
- export order submission
- shipment and logistics tracking
- backend API for data handling
- frontend interface for customers and internal users

## How the Code Works

The project is separated into two main parts:

1. `frontend/` - the user interface built with Vite and React
2. `backend/` - the API server built with Node.js and Express

### Frontend

The frontend is a single-page application that:

- loads configuration from `frontend/src/utils/env.js`
- displays shipment status and order details
- sends API requests to the backend using `axios`
- uses Vite to build and serve the app

Key files and folders:

- `frontend/src/App.jsx` - main application wrapper
- `frontend/src/index.jsx` - React entry point
- `frontend/src/utils/env.js` - environment variable helper
- `frontend/src/components/` - reusable UI components
- `frontend/src/pages/` - page views for customer and admin flows

### Backend

The backend serves REST APIs for the frontend and handles business logic:

- `backend/server.js` - Express server entry point
- `backend/routes/` - API route definitions
- `backend/controllers/` - request handlers and logic
- `backend/models/` - data models or database helpers
- `backend/middleware/` - authentication, validation, and error handling
- `backend/utils/` - utility helpers and shared functions

Backend features include:

- reading environment variables from `.env`
- CORS and security middleware
- order submission and export processing
- data validation and error responses

## Project Structure

```
cellzen-trading/
├── backend/
│   ├── controllers/    # API request handlers
│   ├── middleware/     # auth, validation, error handling
│   ├── models/         # database models or helpers
│   ├── routes/         # Express routes
│   ├── scripts/        # seed and backup scripts
│   ├── utils/          # shared utility functions
│   ├── package.json    # backend dependencies and scripts
│   ├── server.js       # backend entry point
│   └── .env.example    # backend environment template
├── frontend/
│   ├── public/         # static assets
│   ├── src/
│   │   ├── components/ # reusable UI components
│   │   ├── pages/      # page-level views
│   │   ├── utils/      # helper utilities
│   │   ├── App.jsx     # main app component
│   │   └── index.jsx   # frontend entry point
│   ├── package.json    # frontend dependencies and scripts
│   └── .env.example    # frontend environment template
├── package.json        # workspace scripts and dependencies
├── .gitignore          # ignored files
└── README.md           # project documentation
```

## Environment Files

Environment files are used to configure application settings without storing secrets in Git.

- `cellzen-trading/.env.example` - frontend environment template
- `cellzen-trading/backend/.env.example` - backend environment template

Copy these templates to `.env` in the respective folders and update values.

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- npm

### Install Dependencies

From the project root:

```bash
git clone <repository-url>
cd cellzen-trading
npm install
```

Install backend and frontend dependencies if needed:

```bash
npm install --prefix backend
npm install --prefix frontend
```

### Copy Environment Files

```bash
copy .env.example .env
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

Then update the values in each `.env` file as required.

### Run the App

To run frontend and backend separately:

```bash
npm run dev
```

Or run frontend and backend independently:

```bash
npm --prefix frontend run dev
npm --prefix backend run dev
```

### Production Build

```bash
npm run build
```

## Summary

This repository contains the Cellzen Trading application code. The frontend delivers the user interface and the backend provides the export and logistics API. The README now clearly explains company purpose, code structure, environment usage, and how the application works.
