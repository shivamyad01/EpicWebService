/**
 * Safe API utilities to handle JSON parsing errors
 */

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
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
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
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }
  
  return response;
};