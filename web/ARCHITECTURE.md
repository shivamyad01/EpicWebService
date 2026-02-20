# Backend Architecture

This document describes the folder structure and architecture of the Bulk Order Fulfillment App backend.

## Folder Structure

```
web/
├── index.js                 # Main entry point (Express app setup)
├── shopify.js               # Shopify app configuration
├── privacy.js               # GDPR privacy webhook handlers
├── product-creator.js       # Product creation utility (optional)
│
├── config/
│   └── index.js             # Application configuration
│
├── routes/
│   ├── index.js             # Route aggregator
│   ├── order.routes.js      # Order fulfillment routes
│   └── settings.routes.js   # Settings routes
│
├── controllers/
│   ├── index.js             # Controllers index
│   ├── order.controller.js  # Order controller
│   └── settings.controller.js # Settings controller
│
├── services/
│   ├── index.js             # Services index
│   ├── fulfillment.service.js # Fulfillment business logic
│   └── settings.service.js  # Settings service
│
├── middleware/
│   ├── index.js             # Middleware index
│   ├── upload.middleware.js # Multer file upload config
│   └── validation.middleware.js # Input validation
│
├── utils/
│   ├── index.js             # Utils index
│   └── graphql.queries.js   # GraphQL queries/mutations
│
├── database/
│   └── index.js             # Database configuration
│
├── uploads/                 # Temporary file uploads directory
└── data/                    # Data files directory
```

## Architecture Pattern

This app follows a **layered architecture** pattern:

1. **Routes** - Define API endpoints and link to controllers
2. **Controllers** - Handle HTTP requests/responses
3. **Services** - Contain business logic
4. **Middleware** - Cross-cutting concerns (auth, validation, uploads)
5. **Utils** - Helper functions and constants

## API Endpoints

### Order Fulfillment

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders/bulk-fulfill` | Bulk fulfill orders from Excel file |
| GET | `/api/orders/fulfillment-report` | Get last fulfillment report |
| GET | `/api/orders/fulfillment-report/download` | Download report as Excel |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get shop settings |
| POST | `/api/settings` | Save shop settings |

## Key Features

1. **Bulk Order Fulfillment**
   - Upload Excel/CSV file with order numbers and tracking info
   - Automatic order lookup via Shopify API
   - Fulfillment creation with tracking numbers
   - Updates tracking for already fulfilled orders

2. **Per-Shop Data Isolation**
   - Fulfillment summaries stored per shop
   - Settings stored per shop

3. **File Validation**
   - File type validation (xlsx, xls, csv)
   - File size limits (5MB default)
   - Automatic temp file cleanup

## Configuration

Edit `config/index.js` to customize:

```javascript
export const config = {
  port: 3000,
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedExtensions: [".xlsx", ".xls", ".csv"]
  },
  defaultTrackingCompany: "India Post"
};
```

## Running the App

```bash
# Development
npm run dev

# Production
npm run serve
```
