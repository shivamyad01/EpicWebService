import { join } from "path";
import { readFileSync, unlinkSync } from "fs";
import express from "express";
import serveStatic from "serve-static";
import shopify from "./shopify.js";
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

app.post(
  "/api/orders/bulk-fulfill",
  upload.single("file"),
  async (req, res) => {
    const session = res.locals.shopify.session;
    const { shop, accessToken } = session;
    const client = new shopify.api.clients.Graphql({ session });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      lastFulfillmentSummary = [];

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const orders = xlsx.utils.sheet_to_json(sheet);

      const axios = (await import("axios")).default;
      const results = [];

      for (const order of orders) {
        const orderNumberRaw = String(
          order.OrderNumber || order.Name || ""
        ).trim();
        const orderNumber = parseInt(orderNumberRaw.replace(/[^\d]/g, ""));
        const trackingNumber = order.TrackingNumber?.trim();
        const trackingCompany = order.TrackingCompany || "India Post";
        const trackingUrl =
          order.TrackingUrl ||
          `https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx?tn=${trackingNumber}`;

        if (!orderNumber || !trackingNumber) {
          results.push({
            orderNumber: orderNumberRaw,
            trackingNumber,
            trackingCompany,
            error: "Missing Order Number or Tracking Number",
          });
          continue;
        }

        try {
          const restRes = await axios.get(
            `https://${shop}/admin/api/2024-04/orders.json?status=any&order_number=${orderNumber}`,
            { headers: { "X-Shopify-Access-Token": accessToken } }
          );

          const matchingOrders = restRes.data.orders || [];
          if (matchingOrders.length === 0) {
            results.push({
              orderNumber: orderNumberRaw,
              trackingNumber,
              trackingCompany,
              error: "Order not found",
            });
            continue;
          }

          const orderData = matchingOrders.find(
            (o) => parseInt(o.order_number) === orderNumber
          );
          if (!orderData) {
            results.push({
              orderNumber: orderNumberRaw,
              trackingNumber,
              trackingCompany,
              error: "Order not Found",
            });
            continue;
          }

          if (orderData.fulfillment_status === "fulfilled") {
            results.push({
              orderNumber: orderNumberRaw,
              trackingNumber,
              trackingCompany,
              error: "Order already fulfilled",
            });
            continue;
          }

          const orderId = parseInt(orderData.id);
          const gid = `gid://shopify/Order/${orderId}`;

          const fulfillmentOrderRes = await client.query({
            data: {
              query: `
              query ($id: ID!) {
                order(id: $id) {
                  fulfillmentOrders(first: 10) {
                    edges {
                      node {
                        id
                        status
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
              }
            `,
              variables: { id: gid },
            },
          });

          const fulfillmentOrders =
            fulfillmentOrderRes.body?.data?.order?.fulfillmentOrders?.edges ||
            [];

          const openFulfillmentOrder = fulfillmentOrders.find(
            (edge) => edge?.node?.status === "OPEN"
          )?.node;

          if (!openFulfillmentOrder) {
            results.push({
              orderNumber: orderNumberRaw,
              trackingNumber,
              trackingCompany,
              error: `No OPEN fulfillment order found. All are in unfulfillable state.`,
            });
            continue;
          }

          const fulfillmentResult = await client.query({
            data: {
              query: `
              mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
                fulfillmentCreateV2(fulfillment: $fulfillment) {
                  fulfillment { id status }
                  userErrors { field message }
                }
              }
            `,
              variables: {
                fulfillment: {
                  lineItemsByFulfillmentOrder: [
                    {
                      fulfillmentOrderId: openFulfillmentOrder.id,
                      fulfillmentOrderLineItems:
                        openFulfillmentOrder.lineItems.edges.map((item) => ({
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

          if (result.userErrors?.length) {
            results.push({
              orderNumber: orderNumberRaw,
              trackingNumber,
              trackingCompany,
              error: result.userErrors[0].message || "Fulfillment failed",
            });
          } else {
            results.push({
              orderNumber: orderNumberRaw,
              trackingNumber,
              trackingCompany,
              status: result.fulfillment.status,
              fulfillmentId: result.fulfillment.id,
              error: null,
            });
          }
        } catch (err) {
          results.push({
            orderNumber: orderNumberRaw,
            trackingNumber,
            trackingCompany,
            error: err.message || "Unknown error",
          });
        }
      }

      lastFulfillmentSummary = results;

      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.warn("Failed to delete temp file:", e.message);
      }

      return res.status(200).json({ summary: results });
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Internal error during fulfillment" });
    }
  }
);

app.get("/api/orders/fulfillment-report", (req, res) => {
  if (!lastFulfillmentSummary || lastFulfillmentSummary.length === 0) {
    return res
      .status(404)
      .json({ message: "No fulfillment report available." });
  }

  return res.status(200).json({ report: lastFulfillmentSummary });
});

app.get("/api/orders/fulfillment-report/download", (req, res) => {
  if (!lastFulfillmentSummary || lastFulfillmentSummary.length === 0) {
    return res
      .status(404)
      .json({ message: "No fulfillment report available." });
  }

  const workbook = xlsx.utils.book_new();
  const sheetData = [
    ["Order Number", "Tracking Number", "Tracking Company", "Status", "Reason"],
    ...lastFulfillmentSummary.map((r) => [
      r.orderNumber,
      r.trackingNumber || "",
      r.trackingCompany || "",
      r.error ? "Failed" : "Success",
      r.error || "Fulfilled successfully",
    ]),
  ];

  const worksheet = xlsx.utils.aoa_to_sheet(sheetData);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Fulfillment Report");

  const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=fulfillment_report_${Date.now()}.xlsx`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  return res.send(buffer);
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
