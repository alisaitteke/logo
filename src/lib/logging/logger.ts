/**
 * Structured logging for logo provider operations
 * Uses Analytics Engine for faster, real-time logging in production
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

interface AnalyticsEngine {
	writeDataPoint(data: {
		blobs?: string[];
		doubles?: number[];
		indexes?: string[];
	}): void;
}

/**
 * Log provider operation
 * Uses Analytics Engine for faster logging (near real-time vs 5-30s delay with console.log)
 * Falls back to console.log if Analytics Engine is not available
 * @param log - Log entry
 * @param analytics - Optional Analytics Engine binding for faster logging
 */
export function logProviderOperation(
	log: ProviderLog,
	analytics?: AnalyticsEngine
): void {
	const logEntry = {
		...log,
		timestamp: new Date().toISOString(),
	};

	// Use Analytics Engine for faster logging (near real-time)
	if (analytics) {
		try {
			analytics.writeDataPoint({
				blobs: [
					JSON.stringify(logEntry),
					log.provider,
					log.action,
					log.domain || '',
					log.companyName || '',
					log.error || '',
				],
				doubles: [log.duration || 0, log.success ? 1 : 0],
				indexes: [
					log.provider,
					log.action,
					log.success ? 'success' : 'error',
					log.domain || 'unknown',
				],
			});
			// Still log to console for immediate visibility in dev
			if (typeof console !== 'undefined') {
				const logMethod = log.success ? console.log : console.error;
				logMethod('[LogoProvider]', JSON.stringify(logEntry, null, 2));
			}
			return;
		} catch (error) {
			// Fallback to console if Analytics Engine fails
			console.error('Analytics Engine write failed, falling back to console:', error);
		}
	}

	// Fallback to console.log (has 5-30s delay in production)
	if (typeof console !== 'undefined') {
		const logMethod = log.success ? console.log : console.error;
		logMethod('[LogoProvider]', JSON.stringify(logEntry, null, 2));
	}
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

