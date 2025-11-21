/**
 * API Key Validation and Rate Limiting Middleware
 */

import { getApiKey, updateApiKeyLastUsed, type ApiKeyData } from '../auth/api-keys';

export interface RateLimitConfig {
	maxRequests: number;
	windowSeconds: number;
}

export interface ValidationResult {
	valid: boolean;
	apiKey?: string;
	keyData?: ApiKeyData;
	error?: string;
	rateLimited?: boolean;
}

/**
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
	maxRequests: 1000, // 1000 requests per window
	windowSeconds: 3600, // 1 hour window
};

/**
 * Check rate limit for API key
 * @param apiKey - API key to check
 * @param statsKV - KV namespace for statistics
 * @param config - Rate limit configuration
 * @returns True if within rate limit, false if exceeded
 */
export async function checkRateLimit(
	apiKey: string,
	statsKV: KVNamespace,
	config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<{ allowed: boolean; remaining?: number; resetAt?: number }> {
	try {
		const now = Math.floor(Date.now() / 1000);
		const windowStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;
		const rateLimitKey = `ratelimit:${apiKey}:${windowStart}`;

		// Get current count
		const currentCount = await statsKV.get(rateLimitKey);
		const count = parseInt(currentCount || '0', 10);

		if (count >= config.maxRequests) {
			const resetAt = windowStart + config.windowSeconds;
			return {
				allowed: false,
				remaining: 0,
				resetAt,
			};
		}

		// Increment counter atomically
		const newCount = count + 1;
		await statsKV.put(rateLimitKey, newCount.toString(), {
			expirationTtl: config.windowSeconds,
		});

		return {
			allowed: true,
			remaining: config.maxRequests - newCount,
			resetAt: windowStart + config.windowSeconds,
		};
	} catch (error) {
		console.error('Rate limit check failed:', error);
		// On error, allow the request (fail open)
		return { allowed: true };
	}
}

/**
 * Validate API key from request
 * Supports both query parameter (?key=...) and header (X-Api-Key)
 * @param request - Incoming request
 * @param apiKeysKV - KV namespace for API keys
 * @returns Validation result
 */
import { sanitizeApiKey } from '../validation/input';

export async function validateApiKeyFromRequest(
	request: Request,
	apiKeysKV: KVNamespace
): Promise<ValidationResult> {
	try {
		// Try to get API key from query parameter first
		const url = new URL(request.url);
		let apiKey = url.searchParams.get('key');

		// If not in query, try header
		if (!apiKey) {
			apiKey = request.headers.get('X-Api-Key');
		}

		// If still not found, try Authorization header (Bearer token)
		if (!apiKey) {
			const authHeader = request.headers.get('Authorization');
			if (authHeader && authHeader.startsWith('Bearer ')) {
				apiKey = authHeader.substring(7);
			}
		}

		if (!apiKey) {
			return {
				valid: false,
				error: 'API key is required. Provide ?key=your_api_key, X-Api-Key header, or Bearer token',
			};
		}

		// Sanitize API key
		const sanitizedKey = sanitizeApiKey(apiKey);
		if (!sanitizedKey) {
			return {
				valid: false,
				error: 'Invalid API key format',
			};
		}
		apiKey = sanitizedKey;

		// Get key data from KV
		const keyData = await getApiKey(apiKeysKV, apiKey);

		if (!keyData) {
			return {
				valid: false,
				error: 'Invalid API key',
			};
		}

		// Update last used timestamp
		await updateApiKeyLastUsed(apiKeysKV, apiKey);

		return {
			valid: true,
			apiKey,
			keyData,
		};
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : 'Validation error',
		};
	}
}

/**
 * Combined API key validation and rate limiting
 * @param request - Incoming request
 * @param apiKeysKV - KV namespace for API keys
 * @param statsKV - KV namespace for statistics
 * @param rateLimitConfig - Optional rate limit configuration
 * @returns Validation and rate limit result
 */
export async function validateAndRateLimit(
	request: Request,
	apiKeysKV: KVNamespace,
	statsKV: KVNamespace,
	rateLimitConfig?: RateLimitConfig
): Promise<ValidationResult> {
	// First validate API key
	const validation = await validateApiKeyFromRequest(request, apiKeysKV);

	if (!validation.valid || !validation.apiKey) {
		return validation;
	}

	// Then check rate limit
	const rateLimit = await checkRateLimit(validation.apiKey, statsKV, rateLimitConfig);

	if (!rateLimit.allowed) {
		return {
			valid: false,
			apiKey: validation.apiKey,
			keyData: validation.keyData,
			error: 'Rate limit exceeded',
			rateLimited: true,
		};
	}

	return {
		...validation,
		rateLimited: false,
	};
}

import { createCorsResponse } from './cors';
import { ErrorCode, createErrorResponse } from '../errors/handler';

/**
 * Create middleware response for validation errors
 */
export function createValidationErrorResponse(error: string, status = 401, request?: Request): Response {
	const errorResponse = createErrorResponse(
		error,
		status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.VALIDATION_ERROR,
		status
	);

	if (request) {
		return createCorsResponse(
			JSON.stringify({
				...errorResponse,
				timestamp: new Date().toISOString(),
			}),
			{
				status,
				headers: { 'Content-Type': 'application/json' },
			},
			request
		);
	}

	return new Response(
		JSON.stringify({
			...errorResponse,
			timestamp: new Date().toISOString(),
		}),
		{
			status,
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}

/**
 * Create rate limit exceeded response
 */
export function createRateLimitResponse(resetAt?: number): Response {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	if (resetAt) {
		headers['X-RateLimit-Reset'] = resetAt.toString();
		headers['Retry-After'] = Math.max(0, resetAt - Math.floor(Date.now() / 1000)).toString();
	}

	return new Response(
		JSON.stringify({
			error: 'Rate limit exceeded. Please try again later.',
			timestamp: new Date().toISOString(),
		}),
		{
			status: 429,
			headers,
		}
	);
}

