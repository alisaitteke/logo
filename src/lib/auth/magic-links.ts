/**
 * Magic link authentication utilities
 */

export interface MagicLinkToken {
	token: string;
	email: string;
	createdAt: string;
	expiresAt: string;
	used: boolean;
}

/**
 * Generate a secure magic link token
 * @returns Generated token
 */
export function generateMagicLinkToken(): string {
	// Use crypto.randomUUID() for secure random generation
	const uuid = crypto.randomUUID();
	// Remove hyphens and add prefix
	const token = `ml_${uuid.replace(/-/g, '')}`;
	return token;
}

/**
 * Store magic link token in KV
 * @param kvNamespace - KV namespace for magic links
 * @param tokenData - Token data to store
 * @param expiryHours - Expiry time in hours (default: 24)
 * @returns Success status
 */
export async function storeMagicLinkToken(
	kvNamespace: KVNamespace,
	tokenData: Omit<MagicLinkToken, 'used'>,
	expiryHours = 24
): Promise<boolean> {
	try {
		// Calculate expiry timestamp
		const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
		const tokenRecord: MagicLinkToken = {
			...tokenData,
			expiresAt,
			used: false,
		};

		// Store by token
		await kvNamespace.put(`token:${tokenData.token}`, JSON.stringify(tokenRecord), {
			expirationTtl: expiryHours * 60 * 60, // TTL in seconds
		});

		// Also store by email for lookup (optional, for rate limiting)
		const emailKey = `email:${tokenData.email}`;
		const existingTokens = await kvNamespace.get(emailKey);
		let tokenList: string[] = [];

		if (existingTokens) {
			tokenList = JSON.parse(existingTokens);
		}

		// Add new token to email's token list
		tokenList.push(tokenData.token);
		await kvNamespace.put(emailKey, JSON.stringify(tokenList), {
			expirationTtl: expiryHours * 60 * 60,
		});

		return true;
	} catch (error) {
		console.error('Failed to store magic link token:', error);
		return false;
	}
}

/**
 * Retrieve magic link token from KV
 * @param kvNamespace - KV namespace for magic links
 * @param token - Token to retrieve
 * @returns Token data or null if not found
 */
export async function getMagicLinkToken(
	kvNamespace: KVNamespace,
	token: string
): Promise<MagicLinkToken | null> {
	try {
		const tokenData = await kvNamespace.get(`token:${token}`);
		if (!tokenData) {
			return null;
		}
		return JSON.parse(tokenData) as MagicLinkToken;
	} catch (error) {
		console.error('Failed to retrieve magic link token:', error);
		return null;
	}
}

/**
 * Validate magic link token
 * @param kvNamespace - KV namespace for magic links
 * @param token - Token to validate
 * @param checkUsed - Whether to check if token has been used (default: true)
 * @returns Validation result with token data if valid
 */
export async function validateMagicLinkToken(
	kvNamespace: KVNamespace,
	token: string,
	checkUsed = true
): Promise<{ valid: boolean; tokenData?: MagicLinkToken; error?: string }> {
	const tokenData = await getMagicLinkToken(kvNamespace, token);

	if (!tokenData) {
		return { valid: false, error: 'Invalid or expired token' };
	}

	// Only check 'used' status if checkUsed is true (for magic link clicks)
	// Skip this check for cookie-based authentication
	if (checkUsed && tokenData.used) {
		return { valid: false, error: 'Token has already been used' };
	}

	const now = new Date();
	const expiresAt = new Date(tokenData.expiresAt);

	if (now > expiresAt) {
		return { valid: false, error: 'Token has expired' };
	}

	return { valid: true, tokenData };
}

/**
 * Mark magic link token as used
 * @param kvNamespace - KV namespace for magic links
 * @param token - Token to mark as used
 * @returns Success status
 */
export async function markTokenAsUsed(
	kvNamespace: KVNamespace,
	token: string
): Promise<boolean> {
	try {
		const tokenData = await getMagicLinkToken(kvNamespace, token);
		if (!tokenData) {
			return false;
		}

		tokenData.used = true;
		await kvNamespace.put(`token:${token}`, JSON.stringify(tokenData));

		return true;
	} catch (error) {
		console.error('Failed to mark token as used:', error);
		return false;
	}
}

