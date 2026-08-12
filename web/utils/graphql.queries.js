/**
 * GraphQL Queries for Shopify API
 * Centralized location for all GraphQL queries and mutations
 */

export const GET_FULFILLMENT_ORDERS = `
  query GetFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      name
      # pageInfo on both connections so silent truncation can be detected: an order
      # split across many locations, or with a long line-item list, would otherwise
      # be reported as fully fulfilled after only part of it was
      fulfillmentOrders(first: 50) {
        pageInfo { hasNextPage }
        edges {
          node {
            id
            status
            requestStatus
            assignedLocation {
              name
            }
            lineItems(first: 250) {
              pageInfo { hasNextPage }
              edges {
                node {
                  id
                  remainingQuantity
                  totalQuantity
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const CREATE_FULFILLMENT = `
  mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        # Read back what Shopify stored. For a recognized carrier we send no URL
        # and Shopify generates one — an empty url here means the carrier name
        # was not recognized and the tracking number will not be clickable.
        trackingInfo {
          company
          number
          url
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const SEARCH_ORDER_BY_NAME = `
  query SearchOrderByName($query: String!) {
    orders(first: 5, query: $query) {
      edges {
        node {
          id
          name
          legacyResourceId
        }
      }
    }
  }
`;

/**
 * Orders still waiting to be fulfilled, for the pre-filled sheet.
 *
 * Only the name and date are read. A customer name would be more informative in
 * the sheet, but `customer` needs the read_customers scope, and adding a scope
 * re-prompts every merchant to approve the app — too high a price for a
 * reference column.
 */
export const SEARCH_PENDING_ORDERS = `
  query PendingOrders($query: String!, $cursor: String) {
    orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          displayFulfillmentStatus
        }
      }
    }
  }
`;

/**
 * Orders plus the tracking already on them, for the "missing tracking" bucket.
 *
 * Shopify's order search cannot ask whether a fulfillment carries a tracking
 * number — there is no `tracking_number:` filter to negate — so the only way to
 * find these is to read the fulfillments and decide here. That is why this is a
 * separate query from SEARCH_PENDING_ORDERS rather than fields added to it: the
 * other three buckets need none of this and should not pay for it.
 *
 * 50 orders a page, not 250. Each order now drags its fulfillments and their
 * trackingInfo objects along with it, and every object is a point against the
 * calculated query cost. At 250 a busy store's page could outgrow the 1000-point
 * bucket and start coming back throttled; at 50 a typical page costs a few
 * hundred even for orders shipped in several parcels.
 *
 * `status` is read so cancelled fulfillments can be discarded: they still appear
 * here, and one with no tracking number would otherwise look like work to do.
 */
export const SEARCH_ORDERS_WITH_TRACKING = `
  query OrdersWithTracking($query: String!, $cursor: String) {
    orders(first: 50, query: $query, after: $cursor, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          displayFulfillmentStatus
          fulfillments(first: 10) {
            id
            status
            createdAt
            trackingInfo {
              number
            }
          }
        }
      }
    }
  }
`;

/**
 * How many orders sit in each bucket for a date range.
 *
 * ordersCount answers in one request what paging the orders connection would
 * need dozens of round trips to work out, and the page only needs the numbers to
 * show a summary — the rows themselves are fetched for whichever bucket the
 * merchant actually picks.
 */
export const COUNT_ORDERS_BY_STATUS = `
  query OrderCounts($all: String!, $unfulfilled: String!, $partial: String!, $fulfilled: String!) {
    total: ordersCount(query: $all) { count precision }
    unfulfilled: ordersCount(query: $unfulfilled) { count precision }
    partial: ordersCount(query: $partial) { count precision }
    fulfilled: ordersCount(query: $fulfilled) { count precision }
  }
`;

export default {
  GET_FULFILLMENT_ORDERS,
  CREATE_FULFILLMENT,
  SEARCH_ORDER_BY_NAME,
  SEARCH_PENDING_ORDERS,
  SEARCH_ORDERS_WITH_TRACKING,
  COUNT_ORDERS_BY_STATUS
};
