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
│   └── index.js             # Application configuration (rate limits, tracking URLs, etc.)
│
├── routes/
│   ├── index.js             # Route aggregator
│   ├── order.routes.js      # Order fulfillment routes
│   └── settings.routes.js   # Settings routes
│
├── controllers/
│   ├── index.js             # Controllers index
│   ├── order.controller.js  # Order controller (batch processing)
│   └── settings.controller.js # Settings controller
│
├── services/
│   ├── index.js             # Services index
│   ├── fulfillment.service.js # Fulfillment business logic (with retry & rate limiting)
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
2. **Controllers** - Handle HTTP requests/responses, batch processing
3. **Services** - Contain business logic with retry logic and rate limiting
4. **Middleware** - Cross-cutting concerns (auth, validation, uploads)
5. **Utils** - Helper functions and constants

## Key Features

### 1. Bulk Order Fulfillment
- Upload Excel/CSV file with order numbers and tracking info
- **Column validation** - Validates required columns exist
- **Flexible column names** - Supports OrderNumber/Name/Order Number formats
- **Batch processing** - Orders processed in batches of 10
- **Rate limiting** - 250ms delay between API calls
- **Retry logic** - 3 retries with exponential backoff for transient failures
- Automatic order lookup via Shopify API
- Fulfillment creation with tracking numbers
- Updates tracking for already fulfilled orders

### 2. Per-Shop Data Isolation
- Fulfillment summaries stored per shop
- Settings stored per shop

### 3. File Validation
- File type validation (xlsx, xls, csv)
- File size limits (10MB default)
- Automatic temp file cleanup

### 4. Enhanced Report
- Detailed Excel report with summary sheet
- Success rate calculation
- Fulfillment IDs included

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

## Configuration

Edit `config/index.js` to customize:

```javascript
export const config = {
  port: 3000,
  
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedExtensions: [".xlsx", ".xls", ".csv"]
  },
  
  fulfillment: {
    maxOrdersPerRequest: 500,
    batchSize: 10,
    batchDelayMs: 500,
    rateLimitDelayMs: 250,
    maxRetries: 3
  },
  
  defaultTrackingCompany: "India Post",
  
  // Carrier-specific tracking URL templates
  trackingUrlTemplates: {
    "India Post": "https://www.indiapost.gov.in/...",
    "BlueDart": "https://www.bluedart.com/...",
    "Delhivery": "https://www.delhivery.com/..."
  }
};
```

## Excel File Format

| Column | Required | Description |
|--------|----------|-------------|
| OrderNumber | Yes | Order number (e.g., #1025 or 1025) |
| TrackingNumber | Yes | Tracking/AWB number |
| TrackingCompany | No | Carrier name (default: India Post) |
| TrackingUrl | No | Custom tracking URL |

Alternative column names supported:
- `Name`, `Order Number`, `order_number` for OrderNumber
- `Tracking Number`, `tracking_number` for TrackingNumber

## Running the App

```bash
# Development
npm run dev

# Production
npm run serve
```
