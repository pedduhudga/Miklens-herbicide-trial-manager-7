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

import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true
});

/**
 * Sanitize and format AI chat content — converts markdown tables, headers, lists,
 * code blocks, and trial links into beautifully styled, executive-grade HTML.
 * @param {string} content - AI-generated markdown content
 * @param {Object} options - { linkClass, linkStyle } for link styling
 * @returns {string} Sanitized and formatted HTML safe for dangerouslySetInnerHTML
 */
export function sanitizeAiContent(content, options = {}) {
  if (!content) return '';
  
  const { linkClass = '', linkStyle = '' } = options;

  let html = '';
  try {
    html = marked.parse(String(content));
  } catch (err) {
    console.warn('[sanitizeAiContent] marked parse failed, falling back to basic escape:', err);
    return escapeHtml(String(content)).replace(/\n/g, '<br/>');
  }

  // 1. Style tables with executive responsive containers, headers, and striped rows
  html = html.replace(/<table>/g, '<div class="my-3.5 overflow-x-auto rounded-xl border border-slate-200/90 shadow-2xs bg-white"><table class="w-full text-xs text-left border-collapse min-w-[550px]">');
  html = html.replace(/<\/table>/g, '</table></div>');
  html = html.replace(/<thead>/g, '<thead class="bg-gradient-to-r from-slate-100 to-slate-50 text-slate-800 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">');
  html = html.replace(/<th(?=[\s>])/g, '<th class="px-3.5 py-2.5 font-bold text-slate-800 border-r border-slate-200/60 last:border-r-0 whitespace-nowrap"');
  html = html.replace(/<td(?=[\s>])/g, '<td class="px-3.5 py-2.5 text-slate-700 border-b border-slate-100 border-r border-slate-100/60 last:border-r-0 hover:bg-emerald-50/30 transition-colors"');
  html = html.replace(/<tbody>/g, '<tbody class="divide-y divide-slate-100">');
  html = html.replace(/<tr>/g, '<tr class="even:bg-slate-50/50 hover:bg-slate-50/80 transition-colors">');

  // 2. Style headings with clean margins and modern typography
  html = html.replace(/<h1>/g, '<h1 class="text-lg md:text-xl font-black text-slate-900 mt-5 mb-2.5 flex items-center gap-2 border-b border-slate-200 pb-1.5">');
  html = html.replace(/<h2>/g, '<h2 class="text-base md:text-lg font-extrabold text-slate-900 mt-4 mb-2 flex items-center gap-2 border-b border-slate-200 pb-1">');
  html = html.replace(/<h3>/g, '<h3 class="text-sm md:text-base font-bold text-emerald-950 mt-3.5 mb-2 flex items-center gap-1.5 border-b border-emerald-100 pb-1">');
  html = html.replace(/<h4>/g, '<h4 class="text-xs md:text-sm font-bold text-slate-800 mt-3 mb-1.5">');

  // 3. Style bullet and numbered lists
  html = html.replace(/<ul>/g, '<ul class="list-disc list-inside space-y-1.5 my-2.5 text-xs md:text-sm text-slate-700 pl-1">');
  html = html.replace(/<ol>/g, '<ol class="list-decimal list-inside space-y-1.5 my-2.5 text-xs md:text-sm text-slate-700 pl-1">');
  html = html.replace(/<li>/g, '<li class="leading-relaxed">');

  // 4. Style blockquotes and callouts
  html = html.replace(/<blockquote>/g, '<blockquote class="border-l-4 border-emerald-500 bg-emerald-50/70 rounded-r-xl px-4 py-2.5 my-3 text-xs md:text-sm text-emerald-950 italic">');

  // 5. Style code blocks and inline code
  html = html.replace(/<pre><code>/g, '<div class="my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 text-slate-100 text-xs p-3 font-mono overflow-x-auto shadow-inner"><pre><code>');
  html = html.replace(/<\/code><\/pre>/g, '</code></pre></div>');
  html = html.replace(/<code>/g, '<code class="px-1.5 py-0.5 bg-slate-100 text-emerald-900 border border-slate-200 rounded font-mono text-xs">');

  // 6. Style paragraphs
  html = html.replace(/<p>/g, '<p class="my-2 leading-relaxed text-slate-700 text-xs md:text-sm">');

  // 7. Decorate links (trial redirection badges vs external links)
  html = html.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*?)>(.*?)<\/a>/gi, (match, prefix, href, suffix, text) => {
    const isSafe = /^https?:\/\//i.test(href) || href.startsWith('#') || href.startsWith('/');
    const safeUrl = isSafe ? href : '#';

    // Extract trial focus ID for direct click handling
    const focusMatch = safeUrl.match(/[?&]focus=([^&#\s]+)/i);
    const trialId = focusMatch ? focusMatch[1] : '';

    if (trialId) {
      return `<a href="${safeUrl}" data-trial-id="${trialId}" class="trial-redirect-link inline-flex items-center gap-1.5 font-bold px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 shadow-2xs hover:shadow-xs cursor-pointer transition text-xs my-0.5" rel="noopener noreferrer">${text}</a>`;
    }

    const appliedClass = linkClass ? linkClass : 'font-semibold text-emerald-700 hover:text-emerald-900 underline transition';
    const appliedStyle = linkStyle ? ` style="${linkStyle}"` : '';
    return `<a href="${safeUrl}" class="${appliedClass}"${appliedStyle} rel="noopener noreferrer" target="_blank">${text}</a>`;
  });

  return html;
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
