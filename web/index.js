





// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Setup Shopify authentication and webhook handling
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






import multer from "multer";
import xlsx from "xlsx";
import fs from "fs";

const upload = multer({ dest: "uploads/" });



// app.get("/api/products/count", async (_req, res) => {
//   const client = new shopify.api.clients.Graphql({
//     session: res.locals.shopify.session,
//   });

//   const countData = await client.request(`
//     query shopifyProductCount {
//       productsCount {
//         count
//       }
//     }
//   `);

//   res.status(200).send({ count: countData.data.productsCount.count });
// });




// app.post("/api/products", async (_req, res) => {
//   let status = 200;
//   let error = null;

//   try {
//     await productCreator(res.locals.shopify.session);
//   } catch (e) {
//     console.log(`Failed to process products/create: ${e.message}`);
//     status = 500;
//     error = e.message;
//   }
//   res.status(status).send({ success: status === 200, error });
// });



app.post(
  "/api/orders/bulk-fulfill",
  upload.single("file"),
  async (req, res) => {
    const session = res.locals.shopify.session;
    const { shop, accessToken } = session;
    console.log(accessToken);
    
    const client = new shopify.api.clients.Graphql({ session });

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const orders = xlsx.utils.sheet_to_json(sheet);

      const axios = (await import("axios")).default;
      const results = [];

      for (const order of orders) {
        const orderName = order.Name;
        const trackingNumber = order.TrackingNumber;
        const trackingCompany = order.TrackingCompany || "India Post";
        const trackingUrl =
          order.TrackingUrl ||
          `https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx?tn=${trackingNumber}`;

        try {
          // Get Order ID
          const restRes = await axios.get(
            `https://${shop}/admin/api/2024-04/orders.json?name=${encodeURIComponent(
              orderName
            )}`,
            { headers: { "X-Shopify-Access-Token": accessToken } }
          );

          const orderData = restRes.data.orders?.[0];
          if (!orderData || !orderData.id) throw new Error("Order not found");

          const orderId = parseInt(orderData.id);
          const gid = `gid://shopify/Order/${orderId}`;

          // Get Fulfillment Order
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
              }
            `,
              variables: { id: gid },
            },
          });

          const fulfillmentOrder =
            fulfillmentOrderData.body.data.order.fulfillmentOrders.edges[0]
              ?.node;
          if (!fulfillmentOrder) throw new Error("Fulfillment order not found");

          // Create Fulfillment
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
                      fulfillmentOrderId: fulfillmentOrder.id,
                      fulfillmentOrderLineItems:
                        fulfillmentOrder.lineItems.edges.map((item) => ({
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

          const result = fulfillmentResult.body.data.fulfillmentCreateV2;

          if (result.userErrors.length > 0) {
            results.push({ orderName, error: result.userErrors[0].message });
          } else {
            results.push({ orderName, fulfillmentId: result.fulfillment.id });
          }
        } catch (err) {
          results.push({ orderName, error: err.message || "Unknown error" });
        }
      }

      // Cleanup uploaded file
      fs.unlinkSync(req.file.path);

      return res.status(200).json({ summary: results });
    } catch (err) {
      console.error("❌ Bulk fulfillment error:", err.message || err);
      return res
        .status(500)
        .json({ error: "Failed to process bulk fulfillment" });
    }
  }
);



// Serve frontend
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", async (req, res, next) => {
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













