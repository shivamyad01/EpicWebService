// @ts-check
import { join } from "path";
import { readFileSync, unlinkSync } from "fs";
import express from "express";
import serveStatic from "serve-static";
import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import multer from "multer";
import xlsx from "xlsx";
import fs from "fs";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();
const upload = multer({ dest: "uploads/" });

let lastFulfillmentSummary = [];

app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

app.use("/api/*", shopify.validateAuthenticatedSession());
app.use(express.json());

app.post("/api/orders/bulk-fulfill", upload.single("file"), async (req, res) => {
  const session = res.locals.shopify.session;
  const { shop, accessToken } = session;
  const client = new shopify.api.clients.Graphql({ session });

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // ✅ Clear previous result
    lastFulfillmentSummary = [];

    let workbook;
    try {
      workbook = xlsx.readFile(req.file.path);
    } catch (fileErr) {
      return res.status(400).json({ error: "Invalid Excel file format" });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const orders = xlsx.utils.sheet_to_json(sheet);

    const axios = (await import("axios")).default;
    const results = [];

    for (const order of orders) {
      const orderNumber = String(order.OrderNumber || order.Name).trim(); // ✅ use exact value

      const trackingNumber = order.TrackingNumber;
      const trackingCompany = order.TrackingCompany || "India Post";
      const trackingUrl =
        order.TrackingUrl ||
        `https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx?tn=${trackingNumber}`;

      try {
        // Fetch order by name (with full prefix/suffix)
        const restRes = await axios.get(
          `https://${shop}/admin/api/2024-04/orders.json?name=${encodeURIComponent(orderNumber)}`,
          { headers: { "X-Shopify-Access-Token": accessToken } }
        );

        const orderData = restRes.data.orders?.[0];
        if (!orderData || !orderData.id) throw new Error("Order not found");

        const orderId = parseInt(orderData.id);
        const gid = `gid://shopify/Order/${orderId}`;

        // Fetch fulfillment order
        const fulfillmentOrderData = await client.query({
          data: {
            query: `
            query ($id: ID!) {
              order(id: $id) {
                fulfillmentOrders(first: 1) {
                  edges {
                    node {
                      id
                      lineItems(first: 10) {
                        edges {
                          node {
                            id
                            remainingQuantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }`,
            variables: { id: gid },
          },
        });

        const fulfillmentOrder =
          fulfillmentOrderData.body?.data?.order?.fulfillmentOrders?.edges?.[0]?.node;

        if (!fulfillmentOrder) throw new Error("Fulfillment order not found");

        const fulfillmentResult = await client.query({
          data: {
            query: `
            mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
              fulfillmentCreateV2(fulfillment: $fulfillment) {
                fulfillment { id status }
                userErrors { field message }
              }
            }`,
            variables: {
              fulfillment: {
                lineItemsByFulfillmentOrder: [
                  {
                    fulfillmentOrderId: fulfillmentOrder.id,
                    fulfillmentOrderLineItems: fulfillmentOrder.lineItems.edges.map((item) => ({
                      id: item.node.id,
                      quantity: item.node.remainingQuantity,
                    })),
                  },
                ],
                trackingInfo: {
                  number: trackingNumber,
                  company: trackingCompany,
                  url: trackingUrl,
                },
                notifyCustomer: true,
              },
            },
          },
        });

        const result = fulfillmentResult.body?.data?.fulfillmentCreateV2;

        if (!result || result.userErrors?.length > 0) {
          results.push({
            orderNumber,
            error: result?.userErrors?.[0]?.message || "Unknown fulfillment error",
          });
        } else {
          results.push({ orderNumber, fulfillmentId: result.fulfillment.id });
        }
      } catch (err) {
        results.push({ orderNumber, error: err.message || "Unknown error" });
      }
    }

    lastFulfillmentSummary = results;

    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.error("Failed to delete uploaded file:", unlinkErr);
    }

    return res.status(200).json({ summary: results });
  } catch (err) {
    console.error("❌ Bulk fulfillment error:", err.message || err);
    return res.status(500).json({ error: "Failed to process bulk fulfillment" });
  }
});

app.get("/api/orders/fulfillment-report", (req, res) => {
  if (!lastFulfillmentSummary || lastFulfillmentSummary.length === 0) {
    return res.status(404).json({ message: "No fulfillment summary available yet." });
  }

  return res.status(200).json({ report: lastFulfillmentSummary });
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", async (req, res) => {
  const shop = req.query.shop || res.locals.shopify?.session?.shop;
  if (!shop) {
    return res.status(400).send("Missing shop parameter");
  }

  return shopify.ensureInstalledOnShop()(req, res, () => {
    res
      .status(200)
      .set("Content-Type", "text/html")
      .send(
        readFileSync(join(STATIC_PATH, "index.html"))
          .toString()
          .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
      );
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
