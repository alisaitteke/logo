/**
 * Cloudflare Worker API endpoints for logo retrieval
 */

import { Hono } from 'hono';
import { fetchLogo } from '../lib/logo-fetcher';
import { getCacheControlHeaders } from '../lib/storage/cache';
import { getMetadataFromKV } from '../lib/storage/kv';

// Environment bindings interface
interface Env {
	LOGOS: R2Bucket;
	API_KEYS: KVNamespace;
	STATS: KVNamespace;
	MAGIC_LINKS: KVNamespace;
	GETLOGO_API_URL?: string;
	LOGO_DEV_API_URL?: string;
}

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

/**
 * API Key validation middleware
 */
async function validateApiKey(c: any, next: any) {
	const apiKey = c.req.query('key');

	if (!apiKey) {
		return c.json({ error: 'API key is required. Provide ?key=your_api_key' }, 401);
	}

	// Check if API key exists in KV
	const keyData = await c.env.API_KEYS.get(`key:${apiKey}`);

	if (!keyData) {
		return c.json({ error: 'Invalid API key' }, 401);
	}

	// Parse key data
	const keyInfo = JSON.parse(keyData);

	// Store key info in context for later use
	c.set('apiKey', apiKey);
	c.set('keyInfo', keyInfo);

	// Track request in stats
	const date = new Date().toISOString().split('T')[0];
	const statsKey = `stats:${apiKey}:${date}`;
	const currentCount = await c.env.STATS.get(statsKey);
	const newCount = (parseInt(currentCount || '0', 10) + 1).toString();
	await c.env.STATS.put(statsKey, newCount);

	await next();
}

/**
 * Parse and validate query parameters
 */
function parseQueryParams(c: any) {
	const query = c.req.query();

	const format = (query.format as 'png' | 'svg' | 'webp') || 'png';
	const size = query.size ? parseInt(query.size as string, 10) : undefined;
	const greyscale = query.greyscale === 'true' || query.greyscale === '1';
	const apiKey = query.key as string;

	// Validate format
	if (format && !['png', 'svg', 'webp'].includes(format)) {
		throw new Error('Invalid format. Must be png, svg, or webp');
	}

	// Validate size
	if (size && (size < 64 || size > 512)) {
		throw new Error('Size must be between 64 and 512 pixels');
	}

	return {
		format,
		size,
		greyscale,
		apiKey,
	};
}

/**
 * GET /{domain} - Fetch logo by domain
 */
app.get('/:domain', validateApiKey, async (c) => {
	try {
		const domain = c.req.param('domain');
		const params = parseQueryParams(c);

		// Fetch logo
		const result = await fetchLogo({
			domain,
			format: params.format,
			size: params.size,
			greyscale: params.greyscale,
			r2Bucket: c.env.LOGOS,
			kvNamespace: c.env.API_KEYS,
			useCache: true,
		});

		if (!result.success || !result.logo) {
			return c.json(
				{
					error: result.error || 'Failed to fetch logo',
				},
				404
			);
		}

		// Get cache headers
		const headers = getCacheControlHeaders(result.metadata);

		// Return logo as image
		return new Response(result.logo, {
			headers: {
				'Content-Type': `image/${params.format}`,
				...Object.fromEntries(headers.entries()),
			},
		});
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : 'Internal server error',
			},
			500
		);
	}
});

/**
 * GET /name/{companyName} - Fetch logo by company name
 */
app.get('/name/:companyName', validateApiKey, async (c) => {
	try {
		const companyName = c.req.param('companyName');
		const params = parseQueryParams(c);

		// Fetch logo
		const result = await fetchLogo({
			companyName,
			format: params.format,
			size: params.size,
			greyscale: params.greyscale,
			r2Bucket: c.env.LOGOS,
			kvNamespace: c.env.API_KEYS,
			useCache: true,
		});

		if (!result.success || !result.logo) {
			return c.json(
				{
					error: result.error || 'Failed to fetch logo',
				},
				404
			);
		}

		// Get cache headers
		const headers = getCacheControlHeaders(result.metadata);

		// Return logo as image
		return new Response(result.logo, {
			headers: {
				'Content-Type': `image/${params.format}`,
				...Object.fromEntries(headers.entries()),
			},
		});
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : 'Internal server error',
			},
			500
		);
	}
});

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
	return c.json({ status: 'ok', service: 'logo-cdn' });
});

export default app;

