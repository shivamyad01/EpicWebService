/**
 * Application Configuration
 * Centralized configuration management
 */

export const config = {
  port: parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10),
  
  staticPath: process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`,
  
  upload: {
    dest: "uploads/",
    maxFileSize: 10 * 1024 * 1024, // 10MB for larger files
    allowedExtensions: [".xlsx", ".xls", ".csv"]
  },
  
  shopify: {
    // Used to build the REST Admin URLs in fulfillment.service.js. Must match
    // shopify.js's apiVersion and shopify.app.toml's api_version — a version
    // Shopify has retired is not rejected, it is quietly served by the oldest
    // one still supported, so a stale value here fails silently.
    apiVersion: "2026-07"
  },

  // Shopify Managed Pricing. The plans themselves live in the Partner Dashboard,
  // never here — this app only asks whether a subscription exists and sends
  // merchants to Shopify's hosted pricing page when it does not. It must not
  // create charges of its own; doing both is how merchants get double-billed.
  billing: {
    // The `handle` from shopify.app.toml. This is the path segment in the hosted
    // pricing page URL, and is not the same value as client_id.
    appHandle: process.env.SHOPIFY_APP_HANDLE || "epic-fulfill-bulk-orders",

    // Development stores can only ever hold *test* subscriptions, so a deployed
    // container being tested against a dev store has to accept them. This is
    // deliberately its own env var rather than a NODE_ENV check: docker-compose
    // hardcodes NODE_ENV=production, which would otherwise make the live
    // container impossible to test.
    //
    // It must be false for real merchants. A test charge unlocking a paying
    // shop's app is the failure mode this flag exists to prevent.
    acceptTestCharges:
      process.env.BILLING_ACCEPT_TEST_CHARGES === "true" ||
      process.env.NODE_ENV !== "production",

    // How long a subscription lookup is trusted. Every check costs a GraphQL
    // call, and one upload can involve several requests. The
    // app_subscriptions/update webhook clears this early, so the TTL only
    // covers changes that arrive without a webhook.
    cacheTtlMs: 60 * 1000,

    // A billing lookup that throws means Shopify was unreachable, not that the
    // merchant has no plan. Refusing the upload would cost them a shipping day
    // over an outage on our side, so transient failures let the request through
    // and leave a log line instead.
    failOpen: true,

    // Refund the unused part of the current period when a merchant cancels from
    // inside the app. Cancelling ends access immediately (Shopify drops the
    // subscription out of activeSubscriptions the moment it is cancelled), so
    // charging for days they can no longer use would be indefensible.
    prorateOnCancel: true
  },

  // Fulfillment reports live on the mounted volume (docker-compose mounts app_data
  // at /app/data), so a restart or redeploy does not lose the last run's report.
  reportDir:
    process.env.REPORT_DIR ||
    (process.env.NODE_ENV === "production" ? "/app/data/reports" : `${process.cwd()}/reports`),
  
  // Fulfillment settings
  fulfillment: {
    maxOrdersPerRequest: 500,
    batchSize: 10,
    batchDelayMs: 500,
    rateLimitDelayMs: 250,
    maxRetries: 3,
    retryDelayMs: 1000
  },
  
  // Carrier names Shopify recognizes, spelled exactly as Shopify expects
  // (capitalization matters). Sending one of these is what makes Shopify select
  // the carrier, build the tracking URL itself, and keep shipment_status
  // updated — the same result as picking a carrier from the "Shipping carrier"
  // dropdown in the admin. That is why there are no URL templates here:
  // maintaining tracking link formats is Shopify's job, not ours.
  //
  // Shopify's whole published list: the carriers offered to shops in any
  // country plus every country-specific one, deduped and sorted. Source: the
  // Admin API Fulfillment reference, "Supported tracking companies". It used to
  // be a hand-picked subset, which meant a merchant shipping with a carrier
  // Shopify knows perfectly well — Canada Post, Royal Mail, PostNL — had the row
  // rejected as unrecognized.
  //
  // This list also fills the dropdown in the sample spreadsheet
  // (services/sample.service.js), so every name offered there is one this
  // accepts. They cannot drift: there is only this copy.
  shopifyTrackingCompanies: [
    "4PX",
    "ACS Courier",
    "AGS",
    "Alliance Air Freight",
    "Allied Express",
    "Amazon Logistics UK",
    "Amazon Logistics US",
    "An Post",
    "Anjun Logistics",
    "APC",
    "Aramex Australia",
    "Aras Kargo",
    "Asendia USA",
    "Australia Post",
    "Bluedart",
    "Bonds",
    "Bonshaw",
    "BoxKnight",
    "BPost",
    "BPost International",
    "Bring",
    "BRT",
    "Canada Post",
    "Canpar",
    "CDL Last Mile",
    "China Post",
    "Chronopost",
    "Chukou1",
    "Colis Privé",
    "Colissimo",
    "Comingle",
    "Coordinadora",
    "Correios",
    "Correos",
    "Couriers Please",
    "CTT",
    "CTT Express",
    "Cyprus Post",
    "Delhivery",
    "Delnext",
    "Deutsche Post",
    "Deutsche Post (DE)",
    "Deutsche Post (EN)",
    "DHL",
    "DHL eCommerce",
    "DHL eCommerce Asia",
    "DHL Express",
    "DHL Parcel",
    "Direct Couriers",
    "DPD",
    "DPD Ireland",
    "DPD Local",
    "DPD UK",
    "DTD Express",
    "DTDC",
    "DX",
    "Eagle",
    "Ecom Express",
    "Ekart",
    "Estes",
    "Evri",
    "Fastway",
    "FedEx",
    "First Global Logistics",
    "First Line",
    "FSC",
    "Fulfilla",
    "Gati KWE",
    "GLS",
    "GLS Italy",
    "GO Logistics",
    "Guangdong Weisuyi Information Technology (WSE)",
    "Heppner Internationale Spedition GmbH & Co.",
    "Hermes",
    "Hunter Express",
    "Iceland Post",
    "IDEX",
    "India Post",
    "Inpost",
    "Intelcom",
    "Israel Post",
    "Japan Post (EN)",
    "Japan Post (JA)",
    "La Poste",
    "Lasership",
    "Latvia Post",
    "Lietuvos Paštas",
    "Logisters",
    "Lone Star Overnight",
    "Loomis",
    "LSO",
    "M3 Logistics",
    "Meteor Space",
    "Mondial Relay",
    "New Zealand Post",
    "NinjaVan",
    "North Russia Supply Chain (Shenzhen) Co.",
    "Northline",
    "Old Dominion",
    "OnTrac",
    "Packeta",
    "Pago Logistics",
    "Parcelforce",
    "Pilot Freight",
    "Ping An Da Tengfei Express",
    "Pitney Bowes",
    "Portal PostNord",
    "Poste Italiane",
    "PostNL",
    "PostNord DK",
    "PostNord NO",
    "PostNord SE",
    "Professional Couriers",
    "PTT",
    "Purolator",
    "Qxpress",
    "Qyun Express",
    "R+L Carriers",
    "Royal Mail",
    "Royal Shipments",
    "Sagawa (EN)",
    "Sagawa (JA)",
    "Sendle",
    "SEUR",
    "SF Express",
    "SFC Fulfillment",
    "Shadowfax",
    "SHREE NANDAN COURIER",
    "Singapore Post",
    "Skynet",
    "Southwest Air Cargo",
    "Speedy",
    "StarTrack",
    "Step Forward Freight",
    "Swiship",
    "Swiss Post",
    "Sürat Kargo",
    "TForce Final Mile",
    "Tinghao",
    "TNT",
    "TNT Australia",
    "Toll IPEC",
    "Tuffnells",
    "United Delivery Service",
    "UPS",
    "USPS",
    "Venipak",
    "WanbExpress",
    "We Post",
    "Whistl",
    "Wizmo",
    "WMYC",
    "Xpedigo",
    "XPO Logistics",
    "XpressBees",
    "Yamato (EN)",
    "Yamato (JA)",
    "YiFan Express",
    "Yodel",
    "YunExpress",
    "Yurtiçi Kargo",
    "Zásilkovna",
    "Österreichische Post",
    "エコ配",
    "名鉄運輸",
    "日本通運",
    "福山通運",
    "第一貨物",
    "西濃スーパーエキスプレス",
    "西濃運輸"
  ],
  // Carriers whose Shopify-generated link is not a deep link, so we send our own.
  // Verified against a live shop by fulfilling with `company` and no `url`:
  //   India Post -> https://www.indiapost.gov.in/      (homepage, no tracking page)
  //   Bluedart   -> https://www.bluedart.com/tracking  (bare form, no number)
  //   Trackon    -> https://www.indiapost.gov.in/      (wrong carrier — guessed
  //                 from the tracking number's format, Trackon is unknown to Shopify)
  // Delhivery, by contrast, returns a proper deep link and needs no entry here.
  //
  // Sending our own url costs nothing: shipment_status updates depend on the
  // `company` field alone, which we still send with Shopify's exact spelling.
  //
  // The tracking number is appended to the value. Delete an entry to fall back to
  // whatever link Shopify generates. An entry may also name a carrier Shopify does
  // not know (like Trackon) — that makes it usable without a TrackingUrl column.
  //
  // NOTE: these URL formats carried over from the old template list and are NOT
  // verified against the carriers' current sites. Check each one in a browser with
  // a real AWB; if a format is dead, fix it here or delete the entry.
  trackingUrlOverrides: {
    "India Post": "https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx?tn=",
    "Bluedart": "https://www.bluedart.com/tracking?ref=",
    "Trackon": "https://www.trackon.in/courier-tracking?awb="
  },

  // Spellings merchants habitually type, mapped to the exact name to send.
  // Keys must be lowercase. Matching is already case-insensitive, so only real
  // spelling differences belong here — "BlueDart" needs no entry, "Blue Dart" does.
  //
  // A target need not be a carrier Shopify recognizes: "Other" is the label
  // Shopify's own dropdown uses, so we normalize the casing to match what a
  // merchant would see there. It still requires a TrackingUrl, since Shopify
  // cannot derive a link from it.
  trackingCompanyAliases: {
    other: "Other",
    "blue dart": "Bluedart",
    "bluedart express": "Bluedart",
    "dhl": "DHL Express",
    "dtdc courier": "DTDC",
    "ecom": "Ecom Express",
    "ecomexpress": "Ecom Express",
    "ekart logistics": "Ekart",
    "flipkart": "Ekart",
    "gati": "Gati KWE",
    "speed post": "India Post",
    "speedpost": "India Post",
    "the professional couriers": "Professional Couriers",
    "tpc": "Professional Couriers",
    "xpress bees": "XpressBees"
  }
};

export default config;
