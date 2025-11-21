/**
 * Input validation and sanitization utilities
 * Prevents injection attacks and ensures data integrity
 */

/**
 * Sanitize a domain name
 * Removes invalid characters and normalizes the domain
 */
export function sanitizeDomain(domain: string): string | null {
	if (!domain || typeof domain !== 'string') {
		return null;
	}

	// Trim whitespace
	let sanitized = domain.trim().toLowerCase();

	// Remove protocol if present
	sanitized = sanitized.replace(/^https?:\/\//, '');

	// Remove path, query, and fragment
	sanitized = sanitized.split('/')[0];
	sanitized = sanitized.split('?')[0];
	sanitized = sanitized.split('#')[0];

	// Remove port if present
	sanitized = sanitized.split(':')[0];

	// Remove leading/trailing dots
	sanitized = sanitized.replace(/^\.+|\.+$/g, '');

	// Validate domain format (basic check)
	// Domain should contain only alphanumeric, dots, and hyphens
	// Should not start or end with hyphen
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(sanitized)) {
		return null;
	}

	// Limit length (max 253 characters for domain)
	if (sanitized.length > 253) {
		return null;
	}

	// Ensure at least one dot for TLD (e.g., example.com)
	if (!sanitized.includes('.')) {
		return null;
	}

	return sanitized;
}

/**
 * Sanitize a company name
 * Removes invalid characters and normalizes the name
 */
export function sanitizeCompanyName(name: string): string | null {
	if (!name || typeof name !== 'string') {
		return null;
	}

	// Trim whitespace
	let sanitized = name.trim();

	// Remove HTML tags
	sanitized = sanitized.replace(/<[^>]*>/g, '');

	// Remove special characters that could be used for injection
	// Allow alphanumeric, spaces, hyphens, underscores, and common punctuation
	sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-_.,&()]/g, '');

	// Normalize whitespace
	sanitized = sanitized.replace(/\s+/g, ' ');

	// Limit length (max 100 characters)
	if (sanitized.length > 100) {
		return null;
	}

	// Must have at least one character
	if (sanitized.length === 0) {
		return null;
	}

	return sanitized;
}

/**
 * Validate and sanitize format parameter
 */
export function validateFormat(format: string | null): 'png' | 'svg' | 'webp' | null {
	if (!format || typeof format !== 'string') {
		return null;
	}

	const normalized = format.toLowerCase().trim();
	
	if (['png', 'svg', 'webp'].includes(normalized)) {
		return normalized as 'png' | 'svg' | 'webp';
	}

	return null;
}

/**
 * Validate and sanitize size parameter
 */
export function validateSize(size: string | null | undefined): number | null {
	if (!size) {
		return null;
	}

	const parsed = parseInt(String(size), 10);

	if (isNaN(parsed)) {
		return null;
	}

	// Size must be between 64 and 512
	if (parsed < 64 || parsed > 512) {
		return null;
	}

	return parsed;
}

/**
 * Validate and sanitize greyscale parameter
 */
export function validateGreyscale(greyscale: string | null): boolean {
	if (!greyscale) {
		return false;
	}

	const normalized = String(greyscale).toLowerCase().trim();
	return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Sanitize email address
 * Additional validation beyond basic format check
 */
export function sanitizeEmail(email: string): string | null {
	if (!email || typeof email !== 'string') {
		return null;
	}

	// Trim and lowercase
	let sanitized = email.trim().toLowerCase();

	// Remove whitespace
	sanitized = sanitized.replace(/\s/g, '');

	// Basic email format validation
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(sanitized)) {
		return null;
	}

	// Limit length (max 254 characters for email)
	if (sanitized.length > 254) {
		return null;
	}

	// Prevent common injection patterns
	if (sanitized.includes('..') || sanitized.includes('@@')) {
		return null;
	}

	return sanitized;
}

/**
 * Sanitize API key from request
 * Removes whitespace and validates format
 */
export function sanitizeApiKey(key: string | null): string | null {
	if (!key || typeof key !== 'string') {
		return null;
	}

	// Trim whitespace
	let sanitized = key.trim();

	// API keys should be alphanumeric with hyphens/underscores
	// Typical format: 32+ character hex string or similar
	if (!/^[a-zA-Z0-9\-_]+$/.test(sanitized)) {
		return null;
	}

	// Limit length (reasonable API key length)
	if (sanitized.length < 16 || sanitized.length > 256) {
		return null;
	}

	return sanitized;
}

/**
 * Sanitize magic link token
 */
export function sanitizeToken(token: string | null): string | null {
	if (!token || typeof token !== 'string') {
		return null;
	}

	// Trim whitespace
	let sanitized = token.trim();

	// Tokens should be alphanumeric with hyphens/underscores
	if (!/^[a-zA-Z0-9\-_]+$/.test(sanitized)) {
		return null;
	}

	// Limit length
	if (sanitized.length < 16 || sanitized.length > 128) {
		return null;
	}

	return sanitized;
}

/**
 * Validate days parameter for statistics
 */
export function validateDays(days: string | null | undefined): number | null {
	if (!days) {
		return null;
	}

	const parsed = parseInt(String(days), 10);

	if (isNaN(parsed)) {
		return null;
	}

	// Days must be between 1 and 365
	if (parsed < 1 || parsed > 365) {
		return null;
	}

	return parsed;
}

/**
 * Sanitize string input (general purpose)
 * Removes HTML tags and dangerous characters
 */
export function sanitizeString(input: string, maxLength: number = 1000): string | null {
	if (!input || typeof input !== 'string') {
		return null;
	}

	// Trim whitespace
	let sanitized = input.trim();

	// Remove HTML tags
	sanitized = sanitized.replace(/<[^>]*>/g, '');

	// Remove null bytes
	sanitized = sanitized.replace(/\0/g, '');

	// Limit length
	if (sanitized.length > maxLength) {
		return null;
	}

	return sanitized;
}

