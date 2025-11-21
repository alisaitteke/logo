/**
 * Astro middleware to handle API endpoints
 */

import type { MiddlewareHandler } from 'astro';
import { fetchLogo } from './lib/logo-fetcher';
import { getCacheControlHeaders } from './lib/storage/cache';
import { transformImage, needsTransformation } from './lib/images/transform';
import {
	validateEmail,
	generateApiKey,
	storeApiKey,
	getApiKeysByEmail,
	type ApiKeyData,
} from './lib/auth/api-keys';
import {
	generateMagicLinkToken,
	storeMagicLinkToken,
	validateMagicLinkToken,
	markTokenAsUsed,
} from './lib/auth/magic-links';
import {
	generateMagicLinkEmail,
	sendEmailToQueue,
} from './lib/email/queue';
import {
	validateAndRateLimit,
	createValidationErrorResponse,
	createRateLimitResponse,
} from './lib/middleware/api-key-validation';
import { createErrorHttpResponse, CommonErrors } from './lib/errors/handler';
import {
	trackRequest,
	getStatisticsSummary,
	getMultipleKeyStatistics,
} from './lib/stats/statistics';
import {
	handlePreflightRequest,
	createCorsResponse,
	addCorsHeaders,
} from './lib/middleware/cors';
import {
	sanitizeDomain,
	sanitizeCompanyName,
	validateFormat,
	validateSize,
	validateGreyscale,
	sanitizeEmail,
	sanitizeToken,
	validateDays,
} from './lib/validation/input';

export const onRequest: MiddlewareHandler = async (context, next) => {
	const url = new URL(context.request.url);
	const pathname = url.pathname;

	// Handle OPTIONS preflight requests for CORS
	const preflightResponse = handlePreflightRequest(context.request);
	if (preflightResponse) {
		return preflightResponse;
	}

	// Handle API endpoints
	// GET /get?s={query} - Fetch logo by domain or company name
	if (pathname === '/get' && context.request.method === 'GET') {
		const url = new URL(context.request.url);
		const searchParam = url.searchParams.get('s');
		
		if (!searchParam) {
			return createCorsResponse(
				JSON.stringify({ error: 's parameter is required' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}
		
		const query = decodeURIComponent(searchParam);
		
		// Determine if it's a domain or company name
		const isDomain = query.includes('.');
		
		if (isDomain) {
			const sanitizedDomain = sanitizeDomain(query);
			if (!sanitizedDomain) {
				return createCorsResponse(
					JSON.stringify({ error: 'Invalid domain format' }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					},
					context.request
				);
			}
			return handleLogoEndpoint(context, sanitizedDomain, undefined);
		} else {
			const sanitizedName = sanitizeCompanyName(query);
			if (!sanitizedName) {
				return createCorsResponse(
					JSON.stringify({ error: 'Invalid company name format' }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					},
					context.request
				);
			}
			return handleLogoEndpoint(context, undefined, sanitizedName);
		}
	}

	// Health check
	if (pathname === '/health' && context.request.method === 'GET') {
		return createCorsResponse(
			JSON.stringify({ status: 'ok', service: 'logo-cdn' }),
			{
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	}

	// POST /api/request-key - Request API key by email (generates key and sends magic link)
	if (pathname === '/api/request-key' && context.request.method === 'POST') {
		return handleRequestKeyEndpoint(context);
	}

	// GET /api/auth/{token} - Validate magic link token and show API key/stats
	const authMatch = pathname.match(/^\/api\/auth\/([^\/]+)$/);
	if (authMatch && context.request.method === 'GET') {
		const sanitizedToken = sanitizeToken(decodeURIComponent(authMatch[1]));
		if (!sanitizedToken) {
			return createCorsResponse(
				JSON.stringify({ error: 'Invalid token format' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}
		return handleMagicLinkAuthEndpoint(context, sanitizedToken);
	}

	// GET /api/stats - Get statistics for authenticated user
	if (pathname === '/api/stats' && context.request.method === 'GET') {
		return handleStatsEndpoint(context);
	}

	// GET /api/dashboard-data - Get authenticated user's API keys and stats
	if (pathname === '/api/dashboard-data' && context.request.method === 'GET') {
		return handleDashboardDataEndpoint(context);
	}

	// Continue with normal Astro handling
	return next();
};

/**
 * Parse and validate query parameters
 */
function parseQueryParams(url: URL) {
	const formatParam = url.searchParams.get('format');
	const format = validateFormat(formatParam) || 'png';
	
	const sizeParam = url.searchParams.get('size');
	const size = validateSize(sizeParam) || undefined;
	
	const greyscaleParam = url.searchParams.get('greyscale');
	const greyscale = validateGreyscale(greyscaleParam);
	
	const apiKeyParam = url.searchParams.get('key');
	// API key will be validated separately in validation middleware

	return { format, size, greyscale, apiKey: apiKeyParam };
}


/**
 * Handle logo endpoint (unified for domain and company name)
 */
async function handleLogoEndpoint(context: any, domain?: string, companyName?: string) {
	try {
		const url = new URL(context.request.url);
		const params = parseQueryParams(url);

		// Validate API key and check rate limit
		const validation = await validateAndRateLimit(
			context.request,
			context.locals.runtime.env.API_KEYS,
			context.locals.runtime.env.STATS
		);

		if (!validation.valid) {
			if (validation.rateLimited) {
				return addCorsHeaders(createRateLimitResponse(), context.request);
			}
			return addCorsHeaders(
				createValidationErrorResponse(validation.error || 'Invalid API key'),
				context.request
			);
		}

		// Track request statistics
		if (validation.apiKey) {
			await trackRequest(
				validation.apiKey, 
				context.locals.runtime.env.STATS,
				context.locals.runtime.env.API_KEYS
			);
		}

		// Fetch logo from R2/providers
		const result = await fetchLogo({
			domain,
			companyName,
			format: 'png', // Always fetch PNG from providers
			size: 512, // Fetch largest size from providers
			r2Bucket: context.locals.runtime.env.LOGOS,
			kvNamespace: context.locals.runtime.env.API_KEYS,
			useCache: true,
		});

		if (!result.success || !result.logo) {
			return createCorsResponse(
				JSON.stringify({ error: result.error || 'Failed to fetch logo' }),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		// Apply transformations if needed (size, format, greyscale)
		let transformedLogo = result.logo;
		if (needsTransformation({ 
			width: params.size, 
			height: params.size, 
			format: params.format,
			greyscale: params.greyscale 
		})) {
			transformedLogo = await transformImage(result.logo, {
				width: params.size,
				height: params.size,
				format: params.format,
				greyscale: params.greyscale,
			});
		}

		// Get cache headers
		const headers = getCacheControlHeaders(result.metadata);

		// Return transformed logo with CORS headers
		const corsHeaders = new Headers({
			'Content-Type': `image/${params.format}`,
			...Object.fromEntries(headers.entries()),
		});
		const corsResponse = createCorsResponse(
			transformedLogo,
			{
				headers: corsHeaders,
			},
			context.request
		);
		return corsResponse;
	} catch (error) {
		return createCorsResponse(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Internal server error',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	}
}

/**
 * Handle name endpoint
 */
async function handleNameEndpoint(context: any, companyName: string) {
	try {
		const url = new URL(context.request.url);
		const params = parseQueryParams(url);

		// Validate API key and check rate limit
		const validation = await validateAndRateLimit(
			context.request,
			context.locals.runtime.env.API_KEYS,
			context.locals.runtime.env.STATS
		);

		if (!validation.valid) {
			if (validation.rateLimited) {
				return addCorsHeaders(createRateLimitResponse(), context.request);
			}
			return addCorsHeaders(
				createValidationErrorResponse(validation.error || 'Invalid API key'),
				context.request
			);
		}

		// Track request statistics
		if (validation.apiKey) {
			await trackRequest(
				validation.apiKey, 
				context.locals.runtime.env.STATS,
				context.locals.runtime.env.API_KEYS
			);
		}

		// Fetch logo from R2/providers
		const result = await fetchLogo({
			companyName,
			format: 'png', // Always fetch PNG from providers
			size: 512, // Fetch largest size from providers
			r2Bucket: context.locals.runtime.env.LOGOS,
			kvNamespace: context.locals.runtime.env.API_KEYS,
			useCache: true,
		});

		if (!result.success || !result.logo) {
			return createCorsResponse(
				JSON.stringify({ error: result.error || 'Failed to fetch logo' }),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		// Apply transformations if needed (size, format, greyscale)
		let transformedLogo = result.logo;
		if (needsTransformation({ 
			width: params.size, 
			height: params.size, 
			format: params.format,
			greyscale: params.greyscale 
		})) {
			transformedLogo = await transformImage(result.logo, {
				width: params.size,
				height: params.size,
				format: params.format,
				greyscale: params.greyscale,
			});
		}

		// Get cache headers
		const headers = getCacheControlHeaders(result.metadata);

		// Return transformed logo with CORS headers
		const corsHeaders = new Headers({
			'Content-Type': `image/${params.format}`,
			...Object.fromEntries(headers.entries()),
		});
		const corsResponse = createCorsResponse(
			transformedLogo,
			{
				headers: corsHeaders,
			},
			context.request
		);
		return corsResponse;
	} catch (error) {
		return createCorsResponse(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Internal server error',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	}
}

/**
 * Handle API key request endpoint
 */
async function handleRequestKeyEndpoint(context: any) {
	try {
		// Parse request body
		const contentType = context.request.headers.get('content-type');
		if (!contentType || !contentType.includes('application/json')) {
			return createErrorHttpResponse(
				CommonErrors.badRequest('Content-Type must be application/json'),
				context.request
			);
		}

		const body = await context.request.json().catch(() => ({}));
		
		if (!body.email || typeof body.email !== 'string') {
			return createCorsResponse(
				JSON.stringify({ error: 'Email is required' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		// Sanitize and validate email
		const email = sanitizeEmail(body.email);
		if (!email) {
			return createCorsResponse(
				JSON.stringify({ error: 'Invalid email format' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		// Additional email validation
		if (!validateEmail(email)) {
			return createCorsResponse(
				JSON.stringify({ error: 'Invalid email format' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		// Check if user already has an API key
		const existingKeys = await getApiKeysByEmail(context.locals.runtime.env.API_KEYS, email);
		
		let apiKey: string;
		if (existingKeys && existingKeys.length > 0) {
			// User already has a key, use the existing one
			apiKey = existingKeys[0].key;
		} else {
			// Generate new API key for new user
			apiKey = generateApiKey();
			const keyData: ApiKeyData = {
				key: apiKey,
				email,
				createdAt: new Date().toISOString(),
				requestCount: 0,
			};

			// Store in KV
			const stored = await storeApiKey(context.locals.runtime.env.API_KEYS, keyData);

			if (!stored) {
				return createErrorHttpResponse(
					CommonErrors.internalServerError('Failed to store API key. Please try again.'),
					context.request
				);
			}
		}

		// Generate magic link token
		const token = generateMagicLinkToken();
		
		// Get base URL from environment variable or fallback to request origin
		// In production, use the actual domain from environment variable
		const baseUrl = 
			context.locals.runtime.env.BASE_URL || 
			context.locals.runtime.env.SITE_URL ||
			new URL(context.request.url).origin;
		
		const magicLinkUrl = `${baseUrl}/api/auth/${token}`;

		// Store magic link token
		const createdAt = new Date().toISOString();
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		const tokenStored = await storeMagicLinkToken(
			context.locals.runtime.env.MAGIC_LINKS,
			{
				token,
				email,
				createdAt,
				expiresAt,
			},
			24 // 24 hours expiry
		);

		if (!tokenStored) {
			return createErrorHttpResponse(
				CommonErrors.internalServerError('Failed to generate magic link. Please try again.'),
				context.request
			);
		}

		// Generate email content
		const emailMessage = generateMagicLinkEmail({
			email,
			token,
			magicLinkUrl,
		});

		// Send email to queue
		try {
			if (context.locals.runtime.env.EMAIL_QUEUE) {
				await sendEmailToQueue(context.locals.runtime.env.EMAIL_QUEUE, emailMessage);
			}
		} catch (error) {
			console.error('Failed to queue email:', error);
			// Continue even if email queue fails
		}

		// Return success (don't expose API key in response)
		return createCorsResponse(
			JSON.stringify({
				success: true,
				message: 'Magic link has been sent to your email. Please check your inbox.',
				email,
			}),
			{
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	} catch (error) {
		return createCorsResponse(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Internal server error',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	}
}

/**
 * Handle magic link authentication endpoint
 * Validates token, sets cookie, and redirects to dashboard
 */
async function handleMagicLinkAuthEndpoint(context: any, token: string) {
	try {
		// Validate token
		const validation = await validateMagicLinkToken(
			context.locals.runtime.env.MAGIC_LINKS,
			token
		);

		if (!validation.valid || !validation.tokenData) {
			// Invalid token - redirect to home with error
			return new Response(null, {
				status: 302,
				headers: {
					'Location': '/?error=invalid_token',
				},
			});
		}

		// Mark token as used
		await markTokenAsUsed(context.locals.runtime.env.MAGIC_LINKS, token);

		// Set cookie with token (expires in 30 days)
		const expiresDate = new Date();
		expiresDate.setTime(expiresDate.getTime() + (30 * 24 * 60 * 60 * 1000));
		
		// Determine if we're in production (HTTPS) or development (HTTP)
		const isProduction = context.request.url.startsWith('https://');
		const secureFlag = isProduction ? '; Secure' : '';
		const cookieValue = `magic_link_token=${token}; expires=${expiresDate.toUTCString()}; path=/; SameSite=Lax${secureFlag}`;
		
		// Redirect to home page with cookie set
		return new Response(null, {
			status: 302,
			headers: { 
				'Location': '/',
				'Set-Cookie': cookieValue,
			},
		});
	} catch (error) {
		console.error('Magic link auth error:', error);
		return new Response(null, {
			status: 302,
			headers: {
				'Location': '/?error=server_error',
			},
		});
	}
}

/**
 * Handle dashboard data endpoint
 * Returns API keys and statistics for authenticated user (via cookie)
 */
async function handleDashboardDataEndpoint(context: any) {
	try {
		// Get token from cookie
		const cookieHeader = context.request.headers.get('cookie');
		if (!cookieHeader) {
			return createCorsResponse(
				JSON.stringify({ authenticated: false }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		// Parse cookie to get token
		const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, cookie: string) => {
			const [key, value] = cookie.trim().split('=');
			acc[key] = value;
			return acc;
		}, {});

		const token = cookies['magic_link_token'];
		if (!token) {
			return createCorsResponse(
				JSON.stringify({ authenticated: false }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		// Validate token (skip 'used' check for cookie-based auth)
		const validation = await validateMagicLinkToken(
			context.locals.runtime.env.MAGIC_LINKS,
			token,
			false // Don't check 'used' status for cookie authentication
		);

		if (!validation.valid || !validation.tokenData) {
			return createCorsResponse(
				JSON.stringify({ authenticated: false, error: 'Invalid or expired token' }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				},
				context.request
			);
		}

		const { tokenData } = validation;
		const email = tokenData.email;

		// Get API keys for this email
		const apiKeys = await getApiKeysByEmail(context.locals.runtime.env.API_KEYS, email);

		// Get usage statistics
		const stats: Record<string, any> = {};
		for (const keyData of apiKeys) {
			const date = new Date().toISOString().split('T')[0];
			const statsKey = `stats:${keyData.key}:${date}`;
			const todayCount = await context.locals.runtime.env.STATS.get(statsKey);
			stats[keyData.key] = {
				createdAt: keyData.createdAt,
				lastUsed: keyData.lastUsed,
				todayRequests: parseInt(todayCount || '0', 10),
				totalRequests: keyData.requestCount,
			};
		}

		return createCorsResponse(
			JSON.stringify({
				authenticated: true,
				email,
				apiKeys: apiKeys.map((k) => ({
					key: k.key,
					createdAt: k.createdAt,
					lastUsed: k.lastUsed,
				})),
				statistics: stats,
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	} catch (error) {
		console.error('Dashboard data error:', error);
		return createCorsResponse(
			JSON.stringify({ authenticated: false, error: 'Server error' }),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	}
}

/**
 * Handle statistics endpoint
 * Supports both API key and magic link token authentication
 */
async function handleStatsEndpoint(context: any) {
	try {
		const url = new URL(context.request.url);
		const daysParam = url.searchParams.get('days');
		const days = validateDays(daysParam) || 30;

		// Validate days parameter
		if (!days) {
			return createErrorHttpResponse(
				CommonErrors.validationError('Days parameter must be between 1 and 365'),
				context.request
			);
		}

		// Try API key authentication first
		const apiKeyValidation = await validateAndRateLimit(
			context.request,
			context.locals.runtime.env.API_KEYS,
			context.locals.runtime.env.STATS
		);

		let apiKeys: string[] = [];

		if (apiKeyValidation.valid && apiKeyValidation.apiKey) {
			// Authenticated via API key
			apiKeys = [apiKeyValidation.apiKey];
		} else {
			// Try magic link token authentication
			const tokenParam = url.searchParams.get('token');
			if (tokenParam) {
				const tokenValidation = await validateMagicLinkToken(
					context.locals.runtime.env.MAGIC_LINKS,
					tokenParam
				);

				if (tokenValidation.valid && tokenValidation.tokenData) {
					// Get all API keys for this email
					const emailKeys = await getApiKeysByEmail(
						context.locals.runtime.env.API_KEYS,
						tokenValidation.tokenData.email
					);
					apiKeys = emailKeys.map((k) => k.key);
				} else {
					return createErrorHttpResponse(
						CommonErrors.unauthorized('Invalid or expired token'),
						context.request
					);
				}
			} else {
				return createErrorHttpResponse(
					CommonErrors.unauthorized(
						'Authentication required. Provide API key (X-Api-Key header or ?key=) or magic link token (?token=)'
					),
					context.request
				);
			}
		}

		// Get statistics for all API keys
		const statistics = await getMultipleKeyStatistics(
			apiKeys,
			context.locals.runtime.env.STATS,
			context.locals.runtime.env.API_KEYS
		);

		// Aggregate statistics across all keys
		const aggregated = {
			totalRequests: statistics.reduce((sum, stat) => sum + stat.totalRequests, 0),
			todayRequests: statistics.reduce((sum, stat) => sum + stat.todayRequests, 0),
			thisWeekRequests: statistics.reduce((sum, stat) => sum + stat.thisWeekRequests, 0),
			thisMonthRequests: statistics.reduce((sum, stat) => sum + stat.thisMonthRequests, 0),
			keys: statistics.map((stat) => ({
				apiKey: stat.apiKey,
				totalRequests: stat.totalRequests,
				todayRequests: stat.todayRequests,
				thisWeekRequests: stat.thisWeekRequests,
				thisMonthRequests: stat.thisMonthRequests,
				firstRequest: stat.firstRequest,
				lastRequest: stat.lastRequest,
			})),
			dailyBreakdown: aggregateDailyBreakdown(statistics),
		};

		return createCorsResponse(
			JSON.stringify(aggregated),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	} catch (error) {
		return createCorsResponse(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Internal server error',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
			context.request
		);
	}
}

/**
 * Aggregate daily breakdown from multiple statistics
 */
function aggregateDailyBreakdown(statistics: any[]): any[] {
	const dailyMap = new Map<string, number>();

	for (const stat of statistics) {
		for (const day of stat.dailyBreakdown) {
			const current = dailyMap.get(day.date) || 0;
			dailyMap.set(day.date, current + day.requestCount);
		}
	}

	return Array.from(dailyMap.entries())
		.map(([date, requestCount]) => ({ date, requestCount }))
		.sort((a, b) => a.date.localeCompare(b.date));
}
