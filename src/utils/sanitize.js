// src/utils/sanitize.js
// HTML sanitization utility to prevent XSS attacks.
// Used wherever user-generated or AI-generated content is rendered via dangerouslySetInnerHTML.

/**
 * Escape all HTML special characters to prevent XSS.
 * @param {string} text - Raw text to escape
 * @returns {string} Escaped HTML-safe string
 */
export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize HTML by stripping all tags except a safe allowlist.
 * Removes event handlers (onclick, onerror, etc.) and dangerous attributes.
 * @param {string} html - Potentially unsafe HTML string
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  
  const str = String(html);
  
  // First, escape everything
  let safe = escapeHtml(str);
  
  // Then selectively restore safe markdown-style formatting
  // Bold: **text** → <strong>text</strong>
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic: *text* → <em>text</em>
  safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Line breaks
  safe = safe.replace(/\n/g, '<br/>');
  
  return safe;
}

/**
 * Sanitize AI chat content — allows markdown formatting and safe links.
 * @param {string} content - AI-generated content
 * @param {Object} options - { linkClass, linkStyle } for link styling
 * @returns {string} Sanitized HTML safe for dangerouslySetInnerHTML
 */
export function sanitizeAiContent(content, options = {}) {
  if (!content) return '';
  
  const { linkClass = '', linkStyle = '' } = options;
  
  // First escape everything
  let safe = escapeHtml(String(content));
  
  // Restore safe markdown-style links: [text](url) — only allow http(s), #, /
  safe = safe.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
    // Decode the escaped URL
    const decodedUrl = url
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
    
    const isSafe = /^https?:\/\//i.test(decodedUrl) || decodedUrl.startsWith('#') || decodedUrl.startsWith('/');
    const safeUrl = isSafe ? escapeHtml(decodedUrl) : '#';

    // Extract trial focus ID for direct click handling
    const focusMatch = decodedUrl.match(/[?&]focus=([^&#\s]+)/i);
    const trialId = focusMatch ? focusMatch[1] : '';

    let appliedClass = linkClass ? escapeHtml(linkClass) : '';
    if (trialId) {
      appliedClass = (appliedClass + ' trial-redirect-link inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 shadow-2xs hover:shadow-xs cursor-pointer transition text-xs my-0.5').trim();
    }

    const attrs = [
      `href="${safeUrl}"`,
      trialId ? `data-trial-id="${escapeHtml(trialId)}"` : '',
      appliedClass ? `class="${appliedClass}"` : '',
      linkStyle ? `style="${escapeHtml(linkStyle)}"` : '',
      'rel="noopener noreferrer"'
    ].filter(Boolean).join(' ');
    return `<a ${attrs}>${text}</a>`;
  });
  
  // Bold: **text** → <strong>text</strong>
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic: *text* → <em>text</em>
  safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Line breaks
  safe = safe.replace(/\n/g, '<br/>');
  
  return safe;
}

/**
 * Basic input sanitization — trims and limits length.
 * Use on form inputs before storing to Firestore/localStorage.
 * @param {string} input - Raw user input
 * @param {number} maxLength - Maximum allowed length (default 10000)
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input, maxLength = 10000) {
  if (!input) return '';
  return String(input).trim().substring(0, maxLength);
}
