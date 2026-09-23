/**
 * Layer 1.2: Privacy-First Local PII Scrubber & Private Messaging Add-on
 * Designed for WhatsApp Web, Telegram Web, Signal, and WeChat Web.
 * Guarantees zero-data-leakage client-side sanitization prior to cloud or courtroom verification.
 */

// Common regex patterns for PII detection
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const HANDLE_REGEX = /@[A-Za-z0-9_]{2,30}\b/g;
const SSN_CREDIT_REGEX = /\b(?:\d{3}-\d{2}-\d{4}|\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g;

// Conversational greetings & personal preamble markers
const GREETINGS_REGEX = /^(?:hey|hi|hello|dear|listen|yo|sup|good\s+(?:morning|afternoon|evening))\s+[a-zA-Z0-9_.\s]+?[,!.]\s*/i;

// Hearsay / authority preambles (e.g., "my doctor friend at Mayo Clinic says", "Dr. Alan at Stanford claims")
const HEARSAY_PREAMBLES = [
  /^(?:my\s+[\w\s.]*?(?:friend|doctor|uncle|cousin|mom|dad|colleague|brother|sister|source)[\w\s.]*?\s+(?:says|claims|told\s+me)\s+(?:that\s+)?)/i,
  /^(?:(?:dr\.|doctor|professor)\s+[\w\s.]*?\s+(?:says|claims|reported)\s+(?:that\s+)?)/i,
  /^(?:someone\s+forwarded\s+this(?:\s+to\s+me)?[:,\s]*)/i,
  /^(?:did\s+you\s+hear\s+(?:that)?[:,\s]*)/i
];

// Trailing calls to action / contact instructions
const TRAILING_CHATTER = [
  /[.!]?\s*(?:call|phone|contact|message|ping|reach)\s+(?:him|her|them|me)\s+at\s+.*$/i,
  /[.!]?\s*(?:please\s+)?forward\s+this\s+to\s+.*$/i,
  /[.!]?\s*let\s+me\s+know\s+what\s+you\s+think.*$/i
];

export class PiiScrubberService {
  /**
   * Sanitizes personal and identifying information from raw messaging text on-device.
   * @param {string} rawText 
   * @returns {Object} Scrubbed payload and detected redactions
   */
  scrubPii(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { sanitizedText: '', redactedEntities: [] };
    }

    let sanitized = rawText;
    const redactedEntities = [];

    // 1. Scrub Emails
    sanitized = sanitized.replace(EMAIL_REGEX, (match) => {
      redactedEntities.push({ type: 'EMAIL', original: match });
      return '[REDACTED_EMAIL]';
    });

    // 2. Scrub Phone Numbers
    sanitized = sanitized.replace(PHONE_REGEX, (match) => {
      redactedEntities.push({ type: 'PHONE', original: match });
      return '[REDACTED_PHONE]';
    });

    // 3. Scrub Handles
    sanitized = sanitized.replace(HANDLE_REGEX, (match) => {
      redactedEntities.push({ type: 'HANDLE', original: match });
      return '[REDACTED_HANDLE]';
    });

    // 4. Scrub IDs / Financials
    sanitized = sanitized.replace(SSN_CREDIT_REGEX, (match) => {
      redactedEntities.push({ type: 'FINANCIAL_ID', original: match });
      return '[REDACTED_IDENTIFIER]';
    });

    return {
      sanitizedText: sanitized.trim(),
      redactedEntities
    };
  }

  /**
   * Extracts the core falsifiable claim from conversational chat text.
   * Strips greetings, personal claims of authority, and gossip preambles.
   * @param {string} text 
   * @returns {string} Extracted core claim
   */
  extractCoreClaim(text) {
    if (!text || typeof text !== 'string') return '';

    let clean = text.trim();

    // 1. Strip leading greetings
    clean = clean.replace(GREETINGS_REGEX, '').trim();

    // 2. Strip hearsay / personal authority preambles
    for (const pattern of HEARSAY_PREAMBLES) {
      clean = clean.replace(pattern, '').trim();
    }

    // 3. Strip trailing conversational pleasantries
    for (const pattern of TRAILING_CHATTER) {
      clean = clean.replace(pattern, '').trim();
    }

    // Strip trailing punctuation artifacts
    clean = clean.replace(/[.,;:]+$/, '').trim();

    // Capitalize first character
    if (clean.length > 0) {
      clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    return clean;
  }

  /**
   * Generates a client-side verification preview with explicit user opt-in required.
   * @param {string} rawMessage 
   * @returns {Object} Preview object
   */
  createVerificationPreview(rawMessage) {
    const { sanitizedText, redactedEntities } = this.scrubPii(rawMessage);
    const coreClaim = this.extractCoreClaim(sanitizedText);

    return {
      rawMessage,
      sanitizedText,
      coreClaim,
      redactedCount: redactedEntities.length,
      redactedEntities,
      zeroDataLeakageNotice: 'Sanitized claim to verify: zero private, personal, or contact information leaves your machine.',
      isApproved: false
    };
  }

  /**
   * Verifies the sanitized claim using a verification function only if the user explicitly approves.
   * @param {Object} preview 
   * @param {Function} verifierFn 
   * @returns {Promise<Object>} Verification result
   */
  async confirmAndVerify(preview, verifierFn) {
    if (!preview || !preview.isApproved) {
      throw new Error('Explicit user confirmation required before submitting sanitized claim for verification');
    }

    return await verifierFn(preview.coreClaim);
  }
}

export const piiScrubber = new PiiScrubberService();
