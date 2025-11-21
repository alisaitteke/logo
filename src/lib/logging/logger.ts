/**
 * Structured logging for logo provider operations
 */

export interface ProviderLog {
	timestamp: string;
	provider: string;
	action: 'fetch' | 'store' | 'retrieve' | 'error';
	domain?: string;
	companyName?: string;
	success: boolean;
	duration?: number; // milliseconds
	error?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Log provider operation
 * In production, this could send logs to Cloudflare Analytics, Logpush, or external service
 * @param log - Log entry
 */
export function logProviderOperation(log: ProviderLog): void {
	const logEntry = {
		...log,
		timestamp: new Date().toISOString(),
	};

	// In development, log to console
	if (typeof console !== 'undefined') {
		const logMethod = log.success ? console.log : console.error;
		logMethod('[LogoProvider]', JSON.stringify(logEntry, null, 2));
	}

	// In production, you could send to:
	// - Cloudflare Analytics Engine
	// - Cloudflare Logpush
	// - External logging service (Datadog, LogRocket, etc.)
}

/**
 * Create a log entry for provider fetch attempt
 */
export function createFetchLog(
	provider: string,
	success: boolean,
	options: {
		domain?: string;
		companyName?: string;
		duration?: number;
		error?: string;
		metadata?: Record<string, unknown>;
	}
): ProviderLog {
	return {
		timestamp: new Date().toISOString(),
		provider,
		action: 'fetch',
		domain: options.domain,
		companyName: options.companyName,
		success,
		duration: options.duration,
		error: options.error,
		metadata: options.metadata,
	};
}

/**
 * Create a log entry for storage operation
 */
export function createStoreLog(
	provider: string,
	success: boolean,
	options: {
		domain?: string;
		companyName?: string;
		duration?: number;
		error?: string;
		metadata?: Record<string, unknown>;
	}
): ProviderLog {
	return {
		timestamp: new Date().toISOString(),
		provider,
		action: 'store',
		domain: options.domain,
		companyName: options.companyName,
		success,
		duration: options.duration,
		error: options.error,
		metadata: options.metadata,
	};
}

