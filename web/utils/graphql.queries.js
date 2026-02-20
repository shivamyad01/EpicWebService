/**
 * GraphQL Queries for Shopify API
 * Centralized location for all GraphQL queries and mutations
 */

export const GET_FULFILLMENT_ORDERS = `
  query GetFulfillmentOrders($id: ID!) {
    order(id: $id) {
      fulfillmentOrders(first: 10) {
        edges {
          node {
            id
            status
            lineItems(first: 50) {
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
  CREATE_PRODUCT
};
