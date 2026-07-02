/**
 * Retry handler with exponential backoff
 * Provides reliable retry logic for failed operations
 */

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY = 1000; // 1 second
const MAX_DELAY_CAP = 30000; // 30 seconds

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of the function
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelay = DEFAULT_BASE_DELAY,
    onRetry = null,
    shouldRetry = null,
    onAttempt = null
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (onAttempt) onAttempt(attempt);
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this specific error
      if (shouldRetry && !shouldRetry(error, attempt)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        MAX_DELAY_CAP
      );
      
      // Add jitter to prevent thundering herd
      const jitter = delay * (0.5 + Math.random() * 0.5);
      const actualDelay = Math.floor(jitter);
      
      console.log(`[RetryHandler] Attempt ${attempt} failed, retrying in ${Math.round(actualDelay/1000)}s...`, error.message);
      
      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, maxAttempts, error, actualDelay);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
  }
  
  // All retries exhausted
  throw lastError;
}

/**
 * Create a retryable version of a function
 * @param {Function} fn - Async function to make retryable
 * @param {Object} options - Retry options
 * @returns {Function} Retryable function
 */
export function createRetryable(fn, options = {}) {
  return async (...args) => {
    return retryWithBackoff(
      async () => fn(...args),
      options
    );
  };
}

/**
 * Retry handler class for managing multiple retries
 */
export class RetryHandler {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    this.baseDelay = options.baseDelay || DEFAULT_BASE_DELAY;
    this.onRetry = options.onRetry || null;
    this.shouldRetry = options.shouldRetry || null;
  }

  /**
   * Execute a function with retry logic
   */
  async execute(fn) {
    return retryWithBackoff(fn, {
      maxAttempts: this.maxAttempts,
      baseDelay: this.baseDelay,
      onRetry: this.onRetry,
      shouldRetry: this.shouldRetry
    });
  }

  /**
   * Set the retry callback
   */
  setOnRetry(callback) {
    this.onRetry = callback;
  }

  /**
   * Set the should retry predicate
   */
  setShouldRetry(callback) {
    this.shouldRetry = callback;
  }
}

/**
 * Network-specific retry handler
 * Only retries on network errors
 */
export const networkRetryHandler = new RetryHandler({
  maxAttempts: 5,
  baseDelay: 2000,
  shouldRetry: (error, attempt) => {
    // Retry on network errors
    if (error.name === 'NetworkError' || error.name === 'TypeError') return true;
    // Retry on timeout
    if (error.message?.includes('timeout')) return true;
    // Retry on 5xx errors
    if (error.status >= 500) return true;
    // Retry on 429 (rate limit)
    if (error.status === 429) return true;
    return false;
  }
});

/**
 * Photo upload retry handler
 */
export const photoUploadRetryHandler = new RetryHandler({
  maxAttempts: 5,
  baseDelay: 3000,
  shouldRetry: (error, attempt) => {
    // Always retry photo uploads (fragile)
    if (error?.message?.includes('photo') || error?.type === 'photo') return true;
    // Network errors
    if (error.name === 'NetworkError') return true;
    // Timeout
    if (error.message?.includes('timeout')) return true;
    // Server errors
    if (error.status >= 500) return true;
    // Rate limit
    if (error.status === 429) return true;
    return false;
  }
});

/**
 * Sheet sync retry handler
 */
export const sheetSyncRetryHandler = new RetryHandler({
  maxAttempts: 5,
  baseDelay: 2000,
  shouldRetry: (error, attempt) => {
    // Network errors
    if (error.name === 'NetworkError') return true;
    // Timeout
    if (error.message?.includes('timeout')) return true;
    // Server errors
    if (error.status >= 500) return true;
    // Rate limit
    if (error.status === 429) return true;
    // Quota exceeded
    if (error.message?.includes('quota')) return true;
    return false;
  }
});

/**
 * Default retry predicate - retries on most errors
 */
export const defaultShouldRetry = (error, attempt) => {
  // Don't retry on client errors (except rate limit)
  if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
    return false;
  }
  return true;
};

/**
 * Execute with retry and return result object
 */
export async function executeWithRetry(fn, options = {}) {
  const startTime = Date.now();
  let currentAttempt = 1;
  
  try {
    const result = await retryWithBackoff(fn, {
      ...options,
      onAttempt: (attempt) => { currentAttempt = attempt; },
      shouldRetry: options.shouldRetry || defaultShouldRetry
    });
    
    return {
      success: true,
      result,
      attempts: currentAttempt,
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error,
      attempts: currentAttempt,
      duration: Date.now() - startTime
    };
  }
}