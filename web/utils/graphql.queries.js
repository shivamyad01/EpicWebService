/**
 * GraphQL Queries for Shopify API
 * Centralized location for all GraphQL queries and mutations
 */

export const GET_FULFILLMENT_ORDERS = `
  query GetFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      name
      fulfillmentOrders(first: 20) {
        edges {
          node {
            id
            status
            requestStatus
            assignedLocation {
              name
            }
            lineItems(first: 100) {
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
  mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
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

export const CREATE_PRODUCT = `
  mutation populateProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
      }
    }
  }
`;

export default {
  GET_FULFILLMENT_ORDERS,
  CREATE_FULFILLMENT,
  SEARCH_ORDER_BY_NAME,
  CREATE_PRODUCT
};
