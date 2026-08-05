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

export default {
  GET_FULFILLMENT_ORDERS,
  CREATE_FULFILLMENT,
  SEARCH_ORDER_BY_NAME
};
