/**
 * Safe API utilities to handle JSON parsing errors
 */

/**
 * Build the Error thrown for a failed request.
 *
 * The status and the parsed body are attached to it, because some failures carry
 * data the caller has to act on rather than just display — a 402 from the billing
 * gate arrives with the pricing page URL, and throwing only the message would
 * discard it and leave the paywall banner with nowhere to send the merchant.
 */
const httpError = (response, body) => {
  const error = new Error(
    body?.message ||
      body?.error ||
      `HTTP ${response.status}: ${response.statusText}`
  );
  error.status = response.status;
  error.data = body || null;
  return error;
};

/**
 * Safely fetch and parse JSON response
 * Throws meaningful errors if response is not JSON
 */
export const safeFetchJson = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);

    // Check if response is ok
    if (!response.ok) {
      // Try to get error message from response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const errorData = await response.json();
        throw httpError(response, errorData);
      } else {
        // Non-JSON error response
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}${text ? ' - ' + text.slice(0, 200) : ''}`);
      }
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Expected JSON response but got ${contentType || 'unknown content type'}. Response: ${text.slice(0, 200)}...`);
    }

    return await response.json();
  } catch (error) {
    // Re-throw with more context
    if (error.message.includes('Unexpected token')) {
      throw new Error(`Invalid JSON response from ${url}. Server may have returned an error page instead of JSON data.`);
    }
    throw error;
  }
};

/**
 * Handle fetch response for file downloads
 */
export const safeFetchBlob = async (url, options = {}) => {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const errorData = await response.json();
      throw httpError(response, errorData);
    } else {
      throw httpError(response, null);
    }
  }

  return response;
};