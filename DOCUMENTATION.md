# Cellzen Trading — Complete Project Documentation

> **International Goods Export & Logistics Platform**
> Last Updated: April 9, 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Technologies & Frameworks](#3-technologies--frameworks)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Design](#6-database-design)
7. [Frontend–Backend Communication](#7-frontendbackend-communication)
8. [Third-Party Integrations](#8-third-party-integrations)
9. [Brand Colors & Design System](#9-brand-colors--design-system)
10. [Internationalization (i18n)](#10-internationalization-i18n)
11. [Middleware & Security](#11-middleware--security)
12. [Configuration Files](#12-configuration-files)
13. [Environment Variables](#13-environment-variables)
14. [Deployment](#14-deployment)
15. [Additional Features](#15-additional-features)
16. [Development Guide](#16-development-guide)
17. [Project Statistics](#17-project-statistics)

---

## 1. Project Overview

**Project Name:** Cellzen Trading

**Domain:** [www.cellzen.com.np](https://www.cellzen.com.np)

**Purpose:** A full-stack web platform for exporting goods globally — managing product listings, customer inquiries, and an integrated inventory management system.

**Architecture:** Monorepo with separate **Frontend** (React + Vite) and **Backend** (Express.js + Node.js).

**Key Capabilities:**
- Public-facing landing page with product showcase and 3D Earth globe
- Contact form with automatic Email and WhatsApp notifications
- Full inventory management portal (products, stock, locations, sales, reports)
- Barcode scanning for quick stock checks
- Multi-language support (English & Chinese)
- PDF and Excel export for reports
- Image upload and storage via Supabase

---

## 2. Project Structure

```
cellzen-trading/
│
├── frontend/                              # React SPA (Vite)
│   ├── public/                            # Static assets
│   │   ├── Images/                        # Product & branding images
│   │   ├── fonts/                         # Roboto, Galderglynn Titling
│   │   └── *.svg, *.png, *.jpg            # Logos, backgrounds
│   ├── src/
│   │   ├── App.jsx                        # Main router & app wrapper
│   │   ├── main.jsx                       # React entry point
│   │   ├── index.css                      # Global styles (Tailwind + custom fonts)
│   │   ├── components/
│   │   │   ├── Header.jsx                 # Sticky navigation bar
│   │   │   ├── RateToggle.jsx             # Currency/rate toggle
│   │   │   └── ui/                        # Reusable UI components
│   │   │       ├── Button.jsx
│   │   │       ├── Card.jsx
│   │   │       ├── Input.jsx
│   │   │       ├── Footer.jsx
│   │   │       ├── Layout.jsx
│   │   │       └── LanguageToggle.jsx
│   │   ├── pages/
│   │   │   ├── Contact.jsx                # Contact form page
│   │   │   └── Landing/
│   │   │       ├── Landingpage.jsx        # Main landing page
│   │   │       ├── Section1.jsx           # Hero section
│   │   │       ├── Section2.jsx           # About / intro
│   │   │       ├── Section3.jsx           # Features
│   │   │       ├── Section4.jsx           # Product showcase
│   │   │       ├── Section5.jsx           # Gallery
│   │   │       ├── Section6.jsx           # Testimonials / info
│   │   │       ├── Section7.jsx           # CTA / form
│   │   │       └── useScrollReveal.js     # Scroll animation hook
│   │   ├── inventory/                     # Inventory management subsystem
│   │   │   ├── InventoryApp.jsx           # Inventory router
│   │   │   ├── pages/
│   │   │   │   ├── Login.jsx              # Auth (sign-in / sign-up)
│   │   │   │   ├── Dashboard.jsx          # Overview & analytics
│   │   │   │   ├── ProductsPage.jsx       # Product CRUD
│   │   │   │   ├── InventoryPage.jsx      # Stock management
│   │   │   │   ├── LocationsPage.jsx      # Storage locations
│   │   │   │   ├── SalesPage.jsx          # Sales tracking
│   │   │   │   ├── TransfersPage.jsx      # Inter-location transfers
│   │   │   │   ├── ReportsPage.jsx        # Analytics & exports
│   │   │   │   └── ScanPage.jsx           # Barcode scanning
│   │   │   ├── components/
│   │   │   │   ├── InventoryLayout.jsx    # Admin layout wrapper
│   │   │   │   ├── Sidebar.jsx            # Navigation sidebar
│   │   │   │   ├── BarcodeScanner.jsx     # Barcode input component
│   │   │   │   ├── DataTable.jsx          # Tabular data display
│   │   │   │   └── ProtectedRoute.jsx     # Auth guard
│   │   │   ├── context/
│   │   │   │   ├── AuthContext.jsx         # Authentication state
│   │   │   │   └── LanguageContext.jsx     # Language state
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.js             # Auth hook
│   │   │   │   └── useApi.js              # API hook
│   │   │   └── utils/
│   │   │       └── inventoryApi.js        # Inventory API helpers
│   │   ├── hooks/
│   │   │   └── useBreakpoint.js           # Responsive design hook
│   │   ├── api/
│   │   │   └── client.js                  # Axios instance
│   │   ├── i18n/
│   │   │   └── i18n.js                    # i18next configuration
│   │   └── locales/                       # Translation files
│   │       ├── en/                        # English
│   │       └── zh/                        # Chinese
│   ├── index.html                         # HTML entry point
│   └── package.json                       # Frontend dependencies
│
├── backend/                               # Node.js/Express API
│   ├── server.js                          # Main Express server
│   ├── config/
│   │   ├── environment.js                 # Environment variable config
│   │   ├── postgres.js                    # Sequelize/PostgreSQL config
│   │   └── supabase.js                    # Supabase Storage config
│   ├── models/
│   │   ├── FormSubmission.js              # MongoDB schema (contact forms)
│   │   └── Counter.js                     # Sequential ID counter
│   ├── routes/
│   │   └── forms.js                       # Contact form endpoints
│   ├── middleware/
│   │   └── validation.js                  # Error handling middleware
│   ├── services/
│   │   ├── emailService.js                # Nodemailer / Gmail integration
│   │   └── whatsappService.js             # Meta WhatsApp Cloud API
│   ├── inventory/                         # Inventory subsystem
│   │   ├── routes/
│   │   │   ├── index.js                   # Route aggregator
│   │   │   ├── auth.js                    # User auth endpoints
│   │   │   ├── products.js                # Product CRUD + image upload
│   │   │   ├── inventory.js               # Stock tracking
│   │   │   ├── locations.js               # Storage locations
│   │   │   └── reports.js                 # Analytics / reporting
│   │   ├── models/
│   │   │   ├── User.js                    # Sequelize User model
│   │   │   ├── Product.js                 # Sequelize Product model
│   │   │   ├── Inventory.js               # Sequelize Inventory model
│   │   │   ├── Location.js                # Sequelize Location model
│   │   │   ├── Transaction.js             # Sequelize Transaction model
│   │   │   └── index.js                   # Model associations
│   │   ├── middleware/
│   │   │   └── auth.js                    # JWT authentication middleware
│   │   ├── cache.js                       # In-memory LRU cache
│   │   └── seed.js                        # Database seeding
│   ├── scripts/
│   │   └── migrate-images.js              # Image migration helper
│   ├── uploads/                           # Legacy image storage
│   ├── package.json                       # Backend dependencies
│   └── .env                               # Environment config (not committed)
│
├── dist/                                  # Production build output
├── package.json                           # Root workspace scripts
├── vite.config.js                         # Vite build configuration
├── tailwind.config.js                     # Tailwind CSS theme
├── postcss.config.js                      # PostCSS configuration
├── eslint.config.js                       # ESLint rules
├── .env                                   # Root environment variables
├── .github/workflows/
│   └── static.yml                         # GitHub Pages CI/CD
├── README.md                              # Quick-start readme
└── .gitignore                             # Git ignore rules
```

---

## 3. Technologies & Frameworks

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19.1.1 | UI library |
| Vite | 7.1.2 | Build tool & dev server |
| React Router DOM | 7.8.2 | Client-side routing |
| Tailwind CSS | 4.1.12 | Utility-first CSS framework |
| PostCSS | 8.5.6 | CSS post-processing |
| Framer Motion | 12.38.0 | Animations & transitions |
| Axios | 1.7.7 | HTTP client |
| i18next | 25.4.2 | Internationalization |
| i18next-browser-languagedetector | 8.2.0 | Auto language detection |
| React Hot Toast | 2.6.0 | Toast notifications |
| @headlessui/react | 2.2.9 | Accessible headless UI components |
| @heroicons/react | 2.2.0 | Icon library |
| Three.js | 0.183.2 | 3D graphics rendering |
| @react-three/fiber | 9.5.0 | React renderer for Three.js |
| @react-three/drei | 10.7.7 | Three.js helpers for React |
| Tesseract.js | 7.0.0 | OCR (text recognition) |
| Quagga2 | 1.12.1 | Barcode scanning |
| html5-qrcode | 2.3.8 | QR code scanning |
| zxing-wasm | 3.0.1 | WebAssembly barcode decoder |
| @sketchfab/viewer-api | 1.12.1 | 3D model viewer |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 18+ | JavaScript runtime |
| Express | 4.18.2 | Web framework |
| Mongoose | 8.0.0 | MongoDB ODM |
| Sequelize | 6.37.8 | PostgreSQL ORM |
| Supabase JS | 2.100.1 | Cloud storage (images) |
| jsonwebtoken | 9.0.3 | JWT authentication |
| bcryptjs | 3.0.3 | Password hashing |
| Multer | 2.1.1 | File upload handling |
| Nodemailer | 8.0.5 | Email service (Gmail SMTP) |
| Helmet | 7.1.0 | Security headers |
| CORS | 2.8.5 | Cross-origin resource sharing |
| PDFKit | 0.18.0 | PDF generation |
| ExcelJS | 4.4.0 | Excel spreadsheet export |
| image-size | 2.0.2 | Image dimension detection |
| dotenv | 16.3.1 | Environment variable loader |
| Nodemon | 3.0.2 | Dev auto-reload |

### Dev Tooling

| Tool | Version | Purpose |
|---|---|---|
| ESLint | 9.33.0 | Code linting |
| Autoprefixer | 10.4.20 | CSS vendor prefixes |
| @vitejs/plugin-react | — | React support for Vite |

---

## 4. Frontend Architecture

### Routing

The application uses **React Router DOM** with the following route structure:

| Route | Component | Description |
|---|---|---|
| `/` | `Landingpage.jsx` | Public landing page |
| `/contact` | `Contact.jsx` | Contact form page |
| `/inventorymanagement/*` | `InventoryApp.jsx` | Protected admin portal |

#### Inventory Management Routes (nested under `/inventorymanagement/`)

| Route | Component | Auth Required |
|---|---|---|
| `/login` | `Login.jsx` | No |
| `/` | `Dashboard.jsx` | Yes |
| `/products` | `ProductsPage.jsx` | Yes |
| `/inventory` | `InventoryPage.jsx` | Yes |
| `/locations` | `LocationsPage.jsx` | Yes |
| `/sales` | `SalesPage.jsx` | Yes |
| `/transfers` | `TransfersPage.jsx` | Yes |
| `/reports` | `ReportsPage.jsx` | Yes |
| `/scan` | `ScanPage.jsx` | Yes |

### Landing Page Sections

The landing page is composed of **7 sections**, each a separate component:

| Section | Component | Content |
|---|---|---|
| 1 | `Section1.jsx` | Hero with typing animation & 3D Earth globe |
| 2 | `Section2.jsx` | About / introduction |
| 3 | `Section3.jsx` | Features & services |
| 4 | `Section4.jsx` | Product showcase |
| 5 | `Section5.jsx` | Gallery |
| 6 | `Section6.jsx` | Testimonials / information |
| 7 | `Section7.jsx` | Call-to-action / pricing guide form |

### Key UI Components

| Component | File | Purpose |
|---|---|---|
| Header | `components/Header.jsx` | Sticky navbar that hides on scroll |
| Footer | `components/ui/Footer.jsx` | Site footer with links & copyright |
| Layout | `components/ui/Layout.jsx` | Page wrapper (header + children) |
| Button | `components/ui/Button.jsx` | Reusable styled button |
| Card | `components/ui/Card.jsx` | Card container |
| Input | `components/ui/Input.jsx` | Form input field |
| LanguageToggle | `components/ui/LanguageToggle.jsx` | EN / ZH language switcher |
| RateToggle | `components/RateToggle.jsx` | Currency / rate toggle |
| BarcodeScanner | `inventory/components/BarcodeScanner.jsx` | Barcode input component |
| DataTable | `inventory/components/DataTable.jsx` | Tabular data display |
| Sidebar | `inventory/components/Sidebar.jsx` | Inventory sidebar navigation |
| ProtectedRoute | `inventory/components/ProtectedRoute.jsx` | Auth route guard |

### State Management

- **Auth State:** `AuthContext.jsx` — stores JWT in localStorage, exposes `login()`, `register()`, `logout()`
- **Language State:** `LanguageContext.jsx` — manages inventory portal language
- **No global state library** — uses React Context + local state

### Custom Hooks

| Hook | File | Purpose |
|---|---|---|
| `useScrollReveal` | `pages/Landing/useScrollReveal.js` | Scroll-triggered reveal animations |
| `useBreakpoint` | `hooks/useBreakpoint.js` | Responsive breakpoint detection |
| `useAuth` | `inventory/hooks/useAuth.js` | Auth context consumer |
| `useApi` | `inventory/hooks/useApi.js` | API request helper |

---

## 5. Backend Architecture

### Server Entry Point

**File:** `backend/server.js`

The Express server:
1. Loads environment variables
2. Connects to MongoDB (for form submissions)
3. Initializes PostgreSQL + Sequelize (for inventory)
4. Applies middleware (Helmet, CORS, body-parser)
5. Mounts routes (`/api/forms`, `/api/inventory`)
6. Serves static frontend build from `../dist` in production
7. Listens on configured port (default: 5000)

### API Endpoints

#### Form Submission Routes (`/api/forms`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/forms/health` | Health check |
| `POST` | `/api/forms/thangka` | Submit Thangka inquiry |
| `POST` | `/api/forms/soundBowls` | Submit Sound Bowls inquiry |
| `POST` | `/api/forms/sacredItems` | Submit Sacred Items inquiry |
| `POST` | `/api/forms/contact` | Submit contact form (triggers email + WhatsApp) |
| `GET` | `/api/forms/submission/:token` | Retrieve submission by token |
| `GET` | `/api/forms/submissions/:formType` | Get all submissions by type |

#### Authentication Routes (`/api/inventory/auth`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/inventory/auth/register` | Register new user |
| `POST` | `/api/inventory/auth/login` | Login (returns JWT) |
| `GET` | `/api/inventory/auth/me` | Get current user profile |

#### Product Routes (`/api/inventory/products`) — Requires JWT

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | List all products (search + cache) |
| `GET` | `/:id` | Get product by ID |
| `POST` | `/` | Create product (with image upload) |
| `PATCH` | `/:id` | Update product |
| `DELETE` | `/:id` | Delete product |
| `GET` | `/barcode/:barcode` | Find product by barcode |

#### Location Routes (`/api/inventory/locations`) — Requires JWT

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | List all storage locations |
| `POST` | `/` | Create new location |
| `PATCH` | `/:id` | Update location |

#### Inventory Routes (`/api/inventory/inventory`) — Requires JWT

| Method | Endpoint | Description |
|---|---|---|
| Various | Various | Stock transactions, quantity adjustments by location |

#### Report Routes (`/api/inventory/reports`) — Requires JWT

| Method | Endpoint | Description |
|---|---|---|
| Various | Various | Sales analytics, inventory status, PDF/Excel export |

#### General

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend health check |

---

## 6. Database Design

### MongoDB (Form Submissions)

**Connection:** `MONGO_URI` environment variable

#### FormSubmission Schema

```javascript
{
  token:       String  (unique identifier),
  formType:    String  (enum: 'thangka', 'soundBowls', 'sacredItems', 'contact'),
  data:        Mixed   (flexible form data — name, email, phone, country, message, etc.),
  submittedAt: Date,
  createdAt:   Date    (auto),
  updatedAt:   Date    (auto)
}
```

#### Counter Schema

```javascript
{
  _id:   String  (counter name, e.g. 'inquiryNumber'),
  seq:   Number  (current sequence value)
}
```

Used to generate sequential inquiry numbers: `CZN-DDYYMM-XXXX`

### PostgreSQL (Inventory System)

**Connection:** `DATABASE_URL` environment variable (Supabase-hosted PostgreSQL)

**ORM:** Sequelize

#### Users Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| email | STRING | Unique |
| password | STRING | bcrypt hashed |
| name | STRING | |
| role | STRING | User role |
| createdAt | DATE | Auto |
| updatedAt | DATE | Auto |

#### Products Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | STRING | Required |
| description | TEXT | |
| image_url | STRING | Supabase public URL |
| image_url_2 | STRING | Second image (optional) |
| barcode | STRING | Unique |
| cost_price | DECIMAL | |
| retail_price | DECIMAL | |
| wholesale_price | DECIMAL | |
| category | STRING | |
| weight | DECIMAL | |
| size | STRING | |
| createdAt | DATE | Auto |
| updatedAt | DATE | Auto |

#### Inventory Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| product_id | UUID | FK → Products |
| location_id | UUID | FK → Locations |
| quantity | INTEGER | Stock count |

#### Locations Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | STRING | Location name |
| address | STRING | Physical address |
| type | STRING | Warehouse / store / etc. |

#### Transactions Table

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| product_id | UUID | FK → Products |
| location_id | UUID | FK → Locations |
| type | STRING | in / out / transfer |
| quantity | INTEGER | |
| notes | TEXT | |
| createdAt | DATE | Auto |

---

## 7. Frontend–Backend Communication

### API Client Setup

**File:** `frontend/src/api/client.js`

```javascript
const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:5300');

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});
```

- In **development**, the frontend dev server (port 3300) calls the backend at `http://localhost:5300`
- In **production**, the backend serves the built frontend from `../dist`, so API calls go to the same origin

### Contact Form Flow

```
User fills form → POST /api/forms/contact
                      │
                      ├── Save to MongoDB
                      ├── Generate inquiry number (CZN-DDYYMM-XXXX)
                      ├── Send email via Nodemailer (Gmail)
                      ├── Send WhatsApp via Meta Cloud API
                      └── Return token to frontend
```

### Inventory Auth Flow

```
1. User visits /inventorymanagement/login
2. Enters credentials → POST /api/inventory/auth/login
3. Backend verifies password (bcrypt) → Returns JWT (7-day expiry)
4. Frontend stores JWT in localStorage via AuthContext
5. All subsequent API calls include: Authorization: Bearer {token}
6. ProtectedRoute component redirects unauthenticated users to login
```

### Image Upload Flow

```
1. Admin selects image(s) in product form
2. Frontend sends FormData via POST /api/inventory/products
3. Multer processes upload (in-memory storage)
4. Backend uploads to Supabase Storage bucket: "product-images"
5. Upload path: products/{timestamp}-{random}.{ext}
6. Public URL stored in product record (image_url / image_url_2)
```

---

## 8. Third-Party Integrations

### Gmail (Email Notifications)

**Service:** Nodemailer with Gmail SMTP

**Trigger:** Contact form submission

**Features:**
- HTML-formatted email with inquiry details
- Sequential inquiry number: `CZN-DDYYMM-XXXX`
- CZN logo embedded as inline image attachment
- Includes all form fields: name, email, phone, country, message

**Required Env Vars:**
- `EMAIL_USER` — Gmail address (sender)
- `EMAIL_PASS` — Gmail app-specific password
- `EMAIL_TO` — Recipient email address

### Meta WhatsApp Cloud API

**Service:** WhatsApp Business Platform (API v21.0)

**Trigger:** Contact form submission (alongside email)

**Features:**
- Sends formatted WhatsApp message to business number
- Includes name, email, phone, country, message
- Markdown formatting for readability

**Required Env Vars:**
- `WHATSAPP_PHONE_ID` — Business phone number ID
- `WHATSAPP_TOKEN` — Permanent access token
- `WHATSAPP_RECIPIENT` — Target WhatsApp number (with country code)

### Supabase Storage

**Service:** Cloud file storage for product images

**Configuration:**
- Bucket: `product-images` (configurable)
- Upload path: `products/{timestamp}-{random}.{ext}`
- Public URL access enabled
- Supported formats: jpeg, jpg, png, gif, webp
- Max file size: 10MB

**Required Env Vars:**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Service role key
- `SUPABASE_STORAGE_BUCKET` — Bucket name (optional, defaults to `product-images`)

### Supabase PostgreSQL

**Service:** Managed PostgreSQL database for inventory data

**Required Env Vars:**
- `DATABASE_URL` — PostgreSQL connection string

---

## 9. Brand Colors & Design System

### Brand Colors

Only **4 official brand colors** are used:

| Name | Hex | Usage |
|---|---|---|
| **Purple** | `#412460` | Primary brand color |
| **Beige** | `#E5E1DA` | Paper / background |
| **Gold** | `#B99353` | Secondary accent |
| **Dark Gray** | `#2D2D2D` | Ink / text |

### Tailwind Color Configuration

```javascript
// tailwind.config.js
colors: {
  primary: {
    50:  '#F5F3F0',
    100: '#E8E0D6',
    200: '#D4C4B0',
    300: '#B8A088',
    400: '#9C7C60',
    500: '#7A5D47',   // Main brown
    600: '#6B4F3A',
    700: '#5A412F',
    800: '#4A3525',
    900: '#3A2A1D',
    950: '#2A1F15',
  },
  cz: {
    main:             '#412460',  // Purple
    ink:              '#2D2D2D',  // Dark gray
    paper:            '#E5E1DA',  // Beige
    'secondary-light': '#B99353', // Gold
    'secondary-dark':  '#B99353', // Gold
  },
}
```

### Typography

| Font | Weight | Usage | CSS Class |
|---|---|---|---|
| Galderglynn Titling | 300 (Light) | Headings | `premium-font-galdgderlight` |
| Galderglynn Titling | 600 (Semi) | Subheadings | `premium-font-galdgdersemi` |
| Galderglynn Titling | 700 (Bold) | Display | `premium-font-galdgderbold` |
| Roboto | 700 (Bold) | Body emphasis | `text-font-roboto-bold` |
| Inter | 400 | Body text | Default |

Fonts are loaded from `/frontend/public/fonts/`.

### Animations

| Animation | Duration | Description |
|---|---|---|
| `fadeIn` | 0.5s | Opacity 0 → 1 |
| `slideUp` | 0.3s | Translate Y + opacity |
| `spinReverse` | 35s | Reverse rotation (decorative) |
| `spinSlow` | 25s | Slow rotation (decorative) |
| `floatUp` | variable | Landing page particle effect |
| `rotateEarth` | variable | Globe texture scrolling |
| `tiltGlobe` | variable | 3D globe wobble effect |

### Custom Scroll Reveal

The `useScrollReveal` hook uses Intersection Observer to trigger CSS animations when elements enter the viewport, providing a smooth reveal effect on the landing page.

---

## 10. Internationalization (i18n)

### Setup

**Framework:** i18next + react-i18next + i18next-browser-languagedetector

**Supported Languages:**
- English (`en`)
- Chinese (`zh`) — **default**

### Configuration

**File:** `frontend/src/i18n/i18n.js`

- Reads saved language preference from `localStorage`
- Falls back to Chinese (`zh`) by default
- Updates `<html lang="...">` attribute on language change
- Supports cross-tab synchronization

### Translation Files

```
frontend/src/locales/
├── en/
│   ├── common.json        # Navigation, validation, footer
│   ├── homepage.json      # Landing page content
│   ├── about.json         # About page content
│   ├── products.json      # Product descriptions
│   ├── gallery.json       # Gallery captions
│   └── exhibition.json    # Exhibition content
└── zh/
    ├── common.json
    ├── homepage.json
    ├── about.json
    ├── products.json
    ├── gallery.json
    └── exhibition.json
```

### Usage in Components

```jsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t('navigation.home')}</h1>;
}
```

---

## 11. Middleware & Security

### Backend Middleware Stack

| Middleware | Purpose |
|---|---|
| **Helmet** | Sets security HTTP headers (CSP disabled for image loading) |
| **CORS** | Cross-origin request handling |
| **body-parser** | JSON & URL-encoded parsing (10MB limit) |
| **Multer** | Multipart file upload handling (in-memory) |
| **JWT Auth** | Token-based authentication for inventory routes |

### CORS Configuration

**Allowed Origins:**
- Development: `localhost:3300`, `localhost:3001`, `localhost:5173`
- Production: `cellzen-trading.onrender.com`, `www.cellzen.com.np`
- Wildcard: `*.onrender.com`

**Settings:** Credentials enabled, all standard methods allowed.

### Authentication

**Implementation:** JWT (JSON Web Tokens)

| Setting | Value |
|---|---|
| Secret | `JWT_SECRET` env var |
| Expiry | 7 days (configurable via `JWT_EXPIRES_IN`) |
| Header | `Authorization: Bearer {token}` |
| Password Hash | bcryptjs |
| Protected Routes | All `/api/inventory/*` except `/auth/login` and `/auth/register` |

### Frontend Auth Guard

`ProtectedRoute` component checks `AuthContext` for valid session. Unauthenticated users are redirected to `/inventorymanagement/login`.

---

## 12. Configuration Files

### Vite (`vite.config.js`)

- **Root:** `./frontend`
- **Dev Port:** 3300
- **Build Output:** `../dist`
- **Plugin:** `@vitejs/plugin-react`
- **Path Aliases:** `@/`, `src/`, `components/`, `utils/`
- **Allowed Hosts:** `cellzen-trading.onrender.com`, `*.onrender.com`, `www.cellzen.com.np`, `localhost`

### Tailwind CSS (`tailwind.config.js`)

- **Content:** `./frontend/index.html`, `./frontend/src/**/*.{js,jsx,ts,tsx}`
- **Theme:** Custom brand colors (`cz.*`, `primary.*`), fonts (Inter, Galderglynn), animations
- **Plugins:** None

### PostCSS (`postcss.config.js`)

- **Plugins:** `@tailwindcss/postcss`

### ESLint (`eslint.config.js`)

- **Standard:** ECMAScript 2020+, JSX
- **Plugins:** React, React Hooks, React Refresh
- **Ignores:** `dist/`

---

## 13. Environment Variables

### Root `.env`

```env
VITE_API_URL=http://localhost:5300/api
```

### Backend `.env`

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB (form submissions)
MONGO_URI=mongodb://localhost:27017/cellzentrading

# PostgreSQL (inventory — Supabase)
DATABASE_URL=postgresql://...

# JWT Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Gmail (Nodemailer)
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-specific-password
EMAIL_TO=recipient@email.com

# WhatsApp Business API
WHATSAPP_PHONE_ID=your-phone-id
WHATSAPP_TOKEN=your-permanent-token
WHATSAPP_RECIPIENT=+1234567890

# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_STORAGE_BUCKET=product-images

# CORS
CORS_ORIGINS=http://localhost:3300,https://www.cellzen.com.np
```

---

## 14. Deployment

### Production Platform: Render

**URL:** `https://cellzen-trading.onrender.com`

**Custom Domain:** `https://www.cellzen.com.np`

### Build & Start Scripts

```json
{
  "build": "vite build && cd backend && npm install",
  "start": "node backend/server.js"
}
```

**Build process:**
1. Vite builds the React frontend into `dist/`
2. Backend dependencies are installed
3. Express server starts and serves `dist/` as static files

### GitHub Actions (`.github/workflows/static.yml`)

- **Trigger:** Push to `main` branch
- **Action:** Deploys to GitHub Pages
- **Permissions:** `contents: read`, `pages: write`, `id-token: write`

### Server Configuration (Production)

```javascript
// Vite preview config
preview: {
  port: process.env.PORT || 3300,
  host: '0.0.0.0',
  allowedHosts: true  // Safe behind Render reverse proxy
}
```

---

## 15. Additional Features

### In-Memory Cache

**File:** `backend/inventory/cache.js`

- LRU-style in-memory cache for product queries
- Default TTL: 3000ms
- Cache key pattern: `products:{searchQuery}`
- Reduces database load for repeated searches

### Sequential Inquiry Numbers

**Format:** `CZN-DDYYMM-XXXX`

- `CZN` — Company prefix
- `DDYYMM` — Date code
- `XXXX` — Sequential 4-digit number

Generated using MongoDB `Counter` model with atomic `findOneAndUpdate`.

### PDF Generation

- **Library:** PDFKit
- **Use case:** Report/invoice generation
- **Triggered from:** Reports page in inventory portal

### Excel Export

- **Library:** ExcelJS
- **Use case:** Bulk product/inventory data export
- **Format:** `.xlsx`

### Barcode Scanning

**Libraries used:**
- Quagga2 (primary barcode scanner)
- html5-qrcode (QR code alternative)
- zxing-wasm (WebAssembly-based decoder)

**Use case:** Inventory `ScanPage.jsx` — scan product barcodes to quickly look up or adjust stock.

### OCR

- **Library:** Tesseract.js
- **Use case:** Document/receipt text recognition

### 3D Globe

- **Libraries:** Three.js, @react-three/fiber, @react-three/drei
- **Location:** `Section1.jsx` (landing page hero)
- **Feature:** Interactive 3D Earth globe with rotation animations

---

## 16. Development Guide

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- PostgreSQL (local or Supabase)
- Gmail account with app-specific password (for email notifications)
- WhatsApp Business API access (optional)
- Supabase project (for image storage)

### Getting Started

```bash
# 1. Clone the repository
git clone <repo-url>
cd cellzen-trading

# 2. Install dependencies
npm install
cd frontend && npm install
cd ../backend && npm install
cd ..

# 3. Set up environment variables
# Copy and fill in:
#   .env (root)
#   backend/.env

# 4. Start development servers
# Terminal 1 — Frontend (port 3300)
npm run dev

# Terminal 2 — Backend (port 5000)
cd backend && npm run dev
```

### Available Scripts

| Script | Location | Command | Description |
|---|---|---|---|
| Dev (frontend) | Root | `npm run dev` | Start Vite dev server on port 3300 |
| Dev (backend) | Backend | `npm run dev` | Start Express with Nodemon |
| Build | Root | `npm run build` | Build frontend + install backend deps |
| Start | Root | `npm start` | Start production server |
| Preview | Root | `npm run preview` | Preview production build locally |

---

## 17. Project Statistics

| Metric | Count |
|---|---|
| Frontend Components | 20+ |
| Backend API Endpoints | 30+ |
| Inventory Portal Pages | 9 |
| Translation Keys | 200+ |
| Custom Tailwind Colors | 17 (primary scale + cz) |
| Custom Animations | 10+ |
| Third-Party Services | 4 (Gmail, WhatsApp, Supabase, Render) |
| Backend Middleware | 5+ |
| Database Models | 7 (5 PostgreSQL + 2 MongoDB) |
| Supported Languages | 2 (English, Chinese) |

---

> **Cellzen Trading** — Built with React, Express, MongoDB, PostgreSQL, and Supabase.
>
> For questions or issues, contact the development team.
