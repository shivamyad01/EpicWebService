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
│   ├── settings.routes.js   # Settings routes
│   └── billing.routes.js    # Subscription state
│
├── controllers/
│   ├── index.js             # Controllers index
│   ├── order.controller.js  # Order controller (batch processing)
│   ├── settings.controller.js # Settings controller
│   └── billing.controller.js  # Billing controller
│
├── services/
│   ├── index.js             # Services index
│   ├── fulfillment.service.js # Fulfillment business logic (with retry & rate limiting)
│   ├── settings.service.js  # Settings service
│   └── billing.service.js   # Managed Pricing checks, cache, pricing page URL
│
├── middleware/
│   ├── index.js             # Middleware index
│   ├── upload.middleware.js # Multer file upload config
│   ├── validation.middleware.js # Input validation
│   └── billing.middleware.js # Requires an active subscription (402)
│
├── webhooks/
│   └── index.js             # All webhook handlers (privacy + billing + uninstall)
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

### 5. Billing (Shopify Managed Pricing)
- Plans are defined in the **Partner Dashboard**, not in code. The app never
  creates a charge and has no checkout of its own.
- `POST /api/orders/bulk-fulfill` requires an active subscription and answers
  **402** with a `pricingUrl` when there is none.
- Reading and downloading past reports is **not** gated — that work is already
  paid for.
- Subscription state is cached per shop (60s) and cleared by the
  `app_subscriptions/update` webhook, so a new subscriber can upload immediately.
- A failed billing lookup **fails open** (`config.billing.failOpen`): a Shopify
  outage must not cost a merchant their shipping day.

## API Endpoints

### Order Fulfillment

| Method | Endpoint | Description | Needs plan |
|--------|----------|-------------|------------|
| POST | `/api/orders/bulk-fulfill` | Bulk fulfill orders from Excel file | Yes |
| GET | `/api/orders/fulfillment-report` | Get last fulfillment report | No |
| GET | `/api/orders/fulfillment-report/download` | Download report as Excel | No |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get shop settings |
| POST | `/api/settings` | Save shop settings |

### Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/status` | Plan name, price, trial end, pricing page URL |
| GET | `/api/billing/status?refresh=1` | Same, bypassing the 60s cache |
| POST | `/api/billing/cancel` | Cancel the active subscription (no body) |

There is no subscribe endpoint. Starting a plan happens only on Shopify's hosted
pricing page at
`https://admin.shopify.com/store/{store}/charges/{app-handle}/pricing_plans`.

`POST /cancel` takes **no body**: the subscription is resolved from the session, so
there is no id for a caller to pass or spoof. It is idempotent from the merchant's
point of view — with nothing active it reports `cancelled: false, reason:
"no_active_subscription"` rather than failing, because "cancel" and "already
cancelled" want the same thing on screen. `prorate` comes from
`config.billing.prorateOnCancel`.

**Cancelling ends access immediately.** Shopify drops a cancelled subscription out
of `activeSubscriptions` at once, so the gate closes on the very next request —
this is not "cancel at period end". That is why `prorateOnCancel` is `true`:
charging for days the merchant can no longer use would be indefensible. The
confirmation modal says this outright, because it is the part merchants get wrong.

Honouring the paid period instead would mean persisting `currentPeriodEnd` and
keeping the gate open until that date — which needs the database this app does not
yet have.

`?refresh=1` backs the **Refresh status** button on the Plan page. A merchant who
has just subscribed and is looking at a stale "no plan" answer needs a way out
that does not involve waiting, and the webhook cannot be relied on for that — it
may not be deployed yet, or may be late.

### Plan page

`/plan` (frontend, in the nav between Fulfill Order and Feedback) shows the current
plan, trial countdown, renewal date, and links out to the hosted pricing page. It is
**not** gated — a merchant with no plan is exactly who needs it.

It renders four states, which must stay mutually consistent:

| State | Heading | Badge | Primary action |
|-------|---------|-------|----------------|
| Active | plan name | `Active` (success) | **Cancel plan** (destructive) |
| In trial | plan name | `Free trial` (info) + `Test` if `test` | **Cancel plan** (destructive) |
| No plan | "No plan" | `No plan` (critical) | Choose a plan → hosted page |
| Lookup failed | "Plan unavailable" | `Couldn't check` | View plan → hosted page |

There is **no "Change plan"** action. With a single plan there is nothing to switch
between, so an active subscriber gets exactly one meaningful action — cancelling.
Only a merchant *without* a plan is sent to the hosted pricing page. If a second
plan is ever added in the Partner Dashboard, this is the decision to revisit.

The last row matters: fail-open reports `active: true` with no plan name, so an
earlier version showed "No plan" beside an "Active" badge. Anything added here must
keep the heading, the badge, and the status row agreeing.

**The price is never hardcoded.** It comes from `AppSubscription.lineItems[].plan.
pricingDetails`, surfaced as `price: { amount, currencyCode, interval }`. With
Managed Pricing the amount is edited in the Partner Dashboard, so a number written
into the app would start lying the first time it changes there.

**UI conventions.** Polaris primitives only, no inline styles: `Layout.Annotated
Section` for the page shape, `AlphaCard` for surfaces, `VerticalStack`/
`HorizontalStack` with `gap` tokens for spacing, `Divider` between groups, and
skeletons (not a spinner) for the initial load. Note this project is on **Polaris
10.50** — `color` not `tone`, `status` not `tone` on Badge/Banner, and `AlphaCard`
rather than `Card` for the modern surface. The v12 spellings compile silently and
do nothing.

### Trial banner on the Fulfill Order page

The trial countdown only appears within `TRIAL_WARNING_DAYS` (3) of the trial
ending. The Plan page carries the full detail, so repeating "5 days left" on every
visit is banner fatigue — by the time it matters the merchant has learned to
ignore it.

It is an **info** banner, not a warning, and it must not say access is about to
stop. A trial converts to the paid plan on its own and nothing pauses; the only
reason to say anything is the upcoming charge, so the copy names the price
("then continues at US$5.00 every 30 days") and links to the Plan page.

## Billing Setup

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `SHOPIFY_APP_HANDLE` | `epic-fulfill-bulk-orders` | Must match `handle` in `shopify.app.toml` — it is the path segment in the pricing page URL |
| `BILLING_ACCEPT_TEST_CHARGES` | `true` outside production | Accept *test* subscriptions. Development stores can only ever hold test subscriptions, so this must be `true` to test against one. **Leave it off for real merchants** — otherwise a test charge unlocks a paying shop. |

`docker-compose.yml` hardcodes `NODE_ENV=production`, so testing the deployed
container against a dev store needs `BILLING_ACCEPT_TEST_CHARGES=true` in `.env`.

### Deploying a plan change

Webhook subscriptions live in `shopify.app.toml` and only reach Shopify after:

```bash
shopify app deploy
```

Editing the toml alone changes nothing. Plan prices and trial lengths are edited
in the Partner Dashboard and need no deploy.

### Testing the gate

1. Install on a dev store with `BILLING_ACCEPT_TEST_CHARGES=true`.
2. `GET /api/billing/status` → `active: false`.
3. Upload a file → **402**, and the paywall banner appears.
4. "Choose a plan" → hosted page → approve → the banner clears immediately
   (the webhook drops the cache; no 60s wait).
5. Cancel from **Settings → Apps** in the store admin → the banner returns.
6. Set `BILLING_ACCEPT_TEST_CHARGES=false` and confirm the test subscription no
   longer unlocks the app. This is the check that proves production cannot be
   unlocked by a test charge.

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
