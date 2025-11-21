/**
 * API Key generation and management utilities
 */

export interface ApiKeyData {
	key: string;
	email: string;
	createdAt: string;
	requestCount: number;
	lastUsed?: string;
}

/**
 * Validate email format
 * @param email - Email address to validate
 * @returns True if email is valid
 */
export function validateEmail(email: string): boolean {
	// RFC 5322 compliant email regex (simplified)
	const emailRegex =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	return emailRegex.test(email);
}

/**
 * Generate a secure API key
 * @param prefix - Optional prefix for the key (e.g., "logo_")
 * @returns Generated API key
 */
export function generateApiKey(prefix = 'logo_'): string {
	// Use crypto.randomUUID() for secure random generation
	const uuid = crypto.randomUUID();
	// Remove hyphens and add prefix
	const key = `${prefix}${uuid.replace(/-/g, '')}`;
	return key;
}

/**
 * Store API key in KV
 * @param kvNamespace - KV namespace for API keys
 * @param keyData - API key data to store
 * @returns Success status
 */
export async function storeApiKey(
	kvNamespace: KVNamespace,
	keyData: ApiKeyData
): Promise<boolean> {
	try {
		// Store by key
		const keyRecord = JSON.stringify(keyData);
		await kvNamespace.put(`key:${keyData.key}`, keyRecord);

		// Also store by email for lookup
		const emailKey = `email:${keyData.email}`;
		const existingEmailData = await kvNamespace.get(emailKey);
		let emailKeys: string[] = [];

		if (existingEmailData) {
			emailKeys = JSON.parse(existingEmailData);
		}

		// Add new key to email's key list
		if (!emailKeys.includes(keyData.key)) {
			emailKeys.push(keyData.key);
			await kvNamespace.put(emailKey, JSON.stringify(emailKeys));
		}

		return true;
	} catch (error) {
		console.error('Failed to store API key:', error);
		return false;
	}
}

/**
 * Retrieve API key data from KV
 * @param kvNamespace - KV namespace for API keys
 * @param apiKey - API key to retrieve
 * @returns API key data or null if not found
 */
export async function getApiKey(
	kvNamespace: KVNamespace,
	apiKey: string
): Promise<ApiKeyData | null> {
	try {
		const keyData = await kvNamespace.get(`key:${apiKey}`);
		if (!keyData) {
			return null;
		}
		return JSON.parse(keyData) as ApiKeyData;
	} catch (error) {
		console.error('Failed to retrieve API key:', error);
		return null;
	}
}

/**
 * Get all API keys for an email
 * @param kvNamespace - KV namespace for API keys
 * @param email - Email address
 * @returns Array of API key data
 */
export async function getApiKeysByEmail(
	kvNamespace: KVNamespace,
	email: string
): Promise<ApiKeyData[]> {
	try {
		const emailKey = `email:${email}`;
		const keysJson = await kvNamespace.get(emailKey);
		if (!keysJson) {
			return [];
		}

		const keyIds: string[] = JSON.parse(keysJson);
		const keys: ApiKeyData[] = [];

		for (const keyId of keyIds) {
			const keyData = await getApiKey(kvNamespace, keyId);
			if (keyData) {
				keys.push(keyData);
			}
		}

		return keys;
	} catch (error) {
		console.error('Failed to retrieve API keys by email:', error);
		return [];
	}
}

/**
 * Update API key last used timestamp
 * @param kvNamespace - KV namespace for API keys
 * @param apiKey - API key to update
 * @returns Success status
 */
export async function updateApiKeyLastUsed(
	kvNamespace: KVNamespace,
	apiKey: string
): Promise<boolean> {
	try {
		const keyData = await getApiKey(kvNamespace, apiKey);
		if (!keyData) {
			return false;
		}

		keyData.lastUsed = new Date().toISOString();
		await kvNamespace.put(`key:${apiKey}`, JSON.stringify(keyData));

		return true;
	} catch (error) {
		console.error('Failed to update API key last used:', error);
		return false;
	}
}

/**
 * Check if email already has an API key
 * @param kvNamespace - KV namespace for API keys
 * @param email - Email address to check
 * @returns True if email has existing keys
 */
export async function emailHasApiKey(kvNamespace: KVNamespace, email: string): Promise<boolean> {
	try {
		const emailKey = `email:${email}`;
		const keysJson = await kvNamespace.get(emailKey);
		return keysJson !== null;
	} catch (error) {
		return false;
	}
}

