/**
 * CORS middleware utilities
 * Handles CORS headers and OPTIONS preflight requests
 */

export interface CorsConfig {
	allowedOrigins?: string[];
	allowedMethods?: string[];
	allowedHeaders?: string[];
	maxAge?: number;
	allowCredentials?: boolean;
}

const DEFAULT_CORS_CONFIG: Required<CorsConfig> = {
	allowedOrigins: ['*'], // Allow all origins by default
	allowedMethods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
	maxAge: 86400, // 24 hours
	allowCredentials: false,
};

/**
 * Get the origin from the request
 */
function getOrigin(request: Request): string | null {
	return request.headers.get('Origin') || request.headers.get('Referer')?.split('/').slice(0, 3).join('/') || null;
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null, config: CorsConfig): boolean {
	if (!origin) return false;
	
	const allowedOrigins = config.allowedOrigins || DEFAULT_CORS_CONFIG.allowedOrigins;
	
	// Allow all origins
	if (allowedOrigins.includes('*')) {
		return true;
	}
	
	return allowedOrigins.includes(origin);
}

/**
 * Create CORS headers for a response
 */
export function createCorsHeaders(request: Request, config: CorsConfig = {}): Headers {
	const headers = new Headers();
	const origin = getOrigin(request);
	
	const finalConfig: Required<CorsConfig> = {
		allowedOrigins: config.allowedOrigins || DEFAULT_CORS_CONFIG.allowedOrigins,
		allowedMethods: config.allowedMethods || DEFAULT_CORS_CONFIG.allowedMethods,
		allowedHeaders: config.allowedHeaders || DEFAULT_CORS_CONFIG.allowedHeaders,
		maxAge: config.maxAge ?? DEFAULT_CORS_CONFIG.maxAge,
		allowCredentials: config.allowCredentials ?? DEFAULT_CORS_CONFIG.allowCredentials,
	};
	
	// Set Access-Control-Allow-Origin
	if (origin && isOriginAllowed(origin, finalConfig)) {
		headers.set('Access-Control-Allow-Origin', origin);
	} else if (finalConfig.allowedOrigins.includes('*')) {
		headers.set('Access-Control-Allow-Origin', '*');
	}
	
	// Set Access-Control-Allow-Methods
	headers.set('Access-Control-Allow-Methods', finalConfig.allowedMethods.join(', '));
	
	// Set Access-Control-Allow-Headers
	headers.set('Access-Control-Allow-Headers', finalConfig.allowedHeaders.join(', '));
	
	// Set Access-Control-Max-Age
	headers.set('Access-Control-Max-Age', finalConfig.maxAge.toString());
	
	// Set Access-Control-Allow-Credentials (only if origin is not *)
	if (finalConfig.allowCredentials && origin && !finalConfig.allowedOrigins.includes('*')) {
		headers.set('Access-Control-Allow-Credentials', 'true');
	}
	
	// Set Access-Control-Expose-Headers (for custom headers clients might need)
	headers.set('Access-Control-Expose-Headers', 'X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After');
	
	return headers;
}

/**
 * Handle OPTIONS preflight request
 */
export function handlePreflightRequest(request: Request, config: CorsConfig = {}): Response | null {
	if (request.method !== 'OPTIONS') {
		return null;
	}
	
	const corsHeaders = createCorsHeaders(request, config);
	
	return new Response(null, {
		status: 204,
		headers: corsHeaders,
	});
}

/**
 * Add CORS headers to an existing response
 */
export function addCorsHeaders(response: Response, request: Request, config: CorsConfig = {}): Response {
	const corsHeaders = createCorsHeaders(request, config);
	
	// Copy existing headers
	const newHeaders = new Headers(response.headers);
	
	// Add CORS headers
	corsHeaders.forEach((value, key) => {
		newHeaders.set(key, value);
	});
	
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

/**
 * Create a response with CORS headers
 */
export function createCorsResponse(
	body: BodyInit | null,
	init: ResponseInit = {},
	request: Request,
	config: CorsConfig = {}
): Response {
	const corsHeaders = createCorsHeaders(request, config);
	
	// Merge CORS headers with existing headers
	const headers = new Headers(init.headers);
	corsHeaders.forEach((value, key) => {
		headers.set(key, value);
	});
	
	return new Response(body, {
		...init,
		headers,
	});
}

