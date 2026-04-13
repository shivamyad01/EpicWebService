/**
 * Product Routes
 * Routes for demo product operations used by the admin UI
 */

import { Router } from "express";
import shopify from "../shopify.js";
import productCreator, {
  DEFAULT_PRODUCTS_COUNT,
} from "../product-creator.js";

const router = Router();

/**
 * GET /api/products/count
 * Return the total number of products in the shop
 */
router.get("/count", async (req, res) => {
  try {
    const session = res.locals.shopify.session;

    const client = new shopify.api.clients.Rest({ session });
    const response = await client.get({ path: "products/count" });

    // Shopify REST count endpoint returns { count: number }
    return res.status(200).json({ count: response.body.count });
  } catch (error) {
    console.error("Error fetching product count:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch product count" });
  }
});

/**
 * POST /api/products
 * Create a batch of demo products using the GraphQL helper
 */
router.post("/", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const requestedCount = Number(req.body?.count);
    const count = Number.isFinite(requestedCount) && requestedCount > 0
      ? requestedCount
      : DEFAULT_PRODUCTS_COUNT;

    await productCreator(session, count);

    return res.status(200).json({ success: true, count });
  } catch (error) {
    console.error("Error creating products:", error);
    return res
      .status(500)
      .json({ error: "Failed to create products" });
  }
});

export default router;
