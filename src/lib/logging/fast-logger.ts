/**
 * Fast logger using Analytics Engine for near real-time logging
 * Falls back to console.log if Analytics Engine is not available
 * 
 * Why Analytics Engine?
 * - console.log has 5-30 second delay in Cloudflare Workers
 * - Analytics Engine provides near real-time logging (< 1 second)
 * - Better for debugging and monitoring production issues
 */

// Use Cloudflare's AnalyticsEngineDataset type
interface AnalyticsEngine {
	writeDataPoint(data: {
		blobs?: string[];
		doubles?: number[];
		indexes?: string[];
	}): void;
}

interface LogContext {
	level: 'info' | 'warn' | 'error';
	message: string;
	timestamp: string;
	[key: string]: unknown;
}

/**
 * Fast logger that uses Analytics Engine when available
 * @param context - Log context with level, message, and optional metadata
 * @param analytics - Analytics Engine binding (optional)
 */
export function fastLog(
	context: LogContext,
	analytics?: AnalyticsEngine
): void {
	const logEntry: LogContext = {
		...context,
		timestamp: new Date().toISOString(),
	};

	// Use Analytics Engine for faster logging (near real-time)
	if (analytics) {
		try {
			const levelNum = context.level === 'error' ? 3 : context.level === 'warn' ? 2 : 1;
			
			analytics.writeDataPoint({
				blobs: [
					JSON.stringify(logEntry),
					context.message,
					context.level,
					...(Object.keys(context)
						.filter(k => !['level', 'message', 'timestamp'].includes(k))
						.map(k => String(context[k] || ''))),
				],
				doubles: [levelNum, Date.now()],
				indexes: [
					context.level,
					...(context.message.length > 50 
						? [context.message.substring(0, 50)] 
						: [context.message]),
				],
			});
			
			// Still log to console for immediate visibility in dev/local
			if (typeof console !== 'undefined') {
				const logMethod = 
					context.level === 'error' ? console.error :
					context.level === 'warn' ? console.warn :
					console.log;
				logMethod(`[${context.level.toUpperCase()}]`, context.message, logEntry);
			}
			return;
		} catch (error) {
			// Fallback to console if Analytics Engine fails
			if (typeof console !== 'undefined') {
				console.error('Analytics Engine write failed, falling back to console:', error);
			}
		}
	}

	// Fallback to console.log (has 5-30s delay in production)
	if (typeof console !== 'undefined') {
		const logMethod = 
			context.level === 'error' ? console.error :
			context.level === 'warn' ? console.warn :
			console.log;
		logMethod(`[${context.level.toUpperCase()}]`, context.message, logEntry);
	}
}

/**
 * Convenience functions for common log levels
 */
export const logger = {
	info: (message: string, metadata?: Record<string, unknown>, analytics?: AnalyticsEngine) => {
		fastLog({ level: 'info', message, ...metadata }, analytics);
	},
	warn: (message: string, metadata?: Record<string, unknown>, analytics?: AnalyticsEngine) => {
		fastLog({ level: 'warn', message, ...metadata }, analytics);
	},
	error: (message: string, error?: unknown, metadata?: Record<string, unknown>, analytics?: AnalyticsEngine) => {
		const errorData = error instanceof Error 
			? { error: error.message, stack: error.stack }
			: error 
			? { error: String(error) }
			: {};
		fastLog({ level: 'error', message, ...errorData, ...metadata }, analytics);
	},
};

