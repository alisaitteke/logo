/**
 * Request statistics tracking and retrieval utilities
 */

export interface DailyStats {
	date: string;
	requestCount: number;
}

export interface KeyStatistics {
	apiKey: string;
	totalRequests: number;
	dailyStats: DailyStats[];
	firstRequest?: string;
	lastRequest?: string;
}

export interface StatisticsSummary {
	apiKey: string;
	totalRequests: number;
	todayRequests: number;
	thisWeekRequests: number;
	thisMonthRequests: number;
	firstRequest?: string;
	lastRequest?: string;
	dailyBreakdown: DailyStats[];
}

/**
 * Track a single request
 * @param apiKey - API key used for the request
 * @param statsKV - KV namespace for statistics
 * @param timestamp - Optional timestamp (defaults to now)
 */
export async function trackRequest(
	apiKey: string,
	statsKV: KVNamespace,
	timestamp?: Date
): Promise<void> {
	const date = timestamp ? timestamp.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
	const statsKey = `stats:${apiKey}:${date}`;

	try {
		const currentCount = await statsKV.get(statsKey);
		const newCount = (parseInt(currentCount || '0', 10) + 1).toString();
		await statsKV.put(statsKey, newCount);
	} catch (error) {
		console.error('Failed to track request:', error);
	}
}

/**
 * Get daily statistics for a specific date
 * @param apiKey - API key
 * @param statsKV - KV namespace for statistics
 * @param date - Date string (YYYY-MM-DD format)
 * @returns Request count for that day
 */
export async function getDailyStats(
	apiKey: string,
	statsKV: KVNamespace,
	date: string
): Promise<number> {
	try {
		const statsKey = `stats:${apiKey}:${date}`;
		const count = await statsKV.get(statsKey);
		return parseInt(count || '0', 10);
	} catch (error) {
		console.error('Failed to get daily stats:', error);
		return 0;
	}
}

/**
 * Get statistics for a date range
 * @param apiKey - API key
 * @param statsKV - KV namespace for statistics
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Array of daily statistics
 */
export async function getDateRangeStats(
	apiKey: string,
	statsKV: KVNamespace,
	startDate: string,
	endDate: string
): Promise<DailyStats[]> {
	const stats: DailyStats[] = [];
	const start = new Date(startDate);
	const end = new Date(endDate);

	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		const dateStr = d.toISOString().split('T')[0];
		const count = await getDailyStats(apiKey, statsKV, dateStr);
		stats.push({
			date: dateStr,
			requestCount: count,
		});
	}

	return stats;
}

/**
 * Get today's statistics
 */
export async function getTodayStats(
	apiKey: string,
	statsKV: KVNamespace
): Promise<number> {
	const today = new Date().toISOString().split('T')[0];
	return getDailyStats(apiKey, statsKV, today);
}

/**
 * Get this week's statistics
 */
export async function getThisWeekStats(
	apiKey: string,
	statsKV: KVNamespace
): Promise<number> {
	const today = new Date();
	const weekStart = new Date(today);
	weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)

	const startDate = weekStart.toISOString().split('T')[0];
	const endDate = today.toISOString().split('T')[0];

	const stats = await getDateRangeStats(apiKey, statsKV, startDate, endDate);
	return stats.reduce((sum, day) => sum + day.requestCount, 0);
}

/**
 * Get this month's statistics
 */
export async function getThisMonthStats(
	apiKey: string,
	statsKV: KVNamespace
): Promise<number> {
	const today = new Date();
	const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

	const startDate = monthStart.toISOString().split('T')[0];
	const endDate = today.toISOString().split('T')[0];

	const stats = await getDateRangeStats(apiKey, statsKV, startDate, endDate);
	return stats.reduce((sum, day) => sum + day.requestCount, 0);
}

/**
 * Get comprehensive statistics summary
 * @param apiKey - API key
 * @param statsKV - KV namespace for statistics
 * @param apiKeysKV - KV namespace for API keys (to get first/last request times)
 * @param days - Number of days to include in daily breakdown (default: 30)
 * @returns Statistics summary
 */
export async function getStatisticsSummary(
	apiKey: string,
	statsKV: KVNamespace,
	apiKeysKV: KVNamespace,
	days = 30
): Promise<StatisticsSummary> {
	const today = new Date();
	const startDate = new Date(today);
	startDate.setDate(today.getDate() - days);

	const startDateStr = startDate.toISOString().split('T')[0];
	const endDateStr = today.toISOString().split('T')[0];

	// Get daily breakdown
	const dailyBreakdown = await getDateRangeStats(apiKey, statsKV, startDateStr, endDateStr);

	// Get aggregated stats
	const todayRequests = await getTodayStats(apiKey, statsKV);
	const thisWeekRequests = await getThisWeekStats(apiKey, statsKV);
	const thisMonthRequests = await getThisMonthStats(apiKey, statsKV);

	// Calculate total requests from daily breakdown
	const totalRequests = dailyBreakdown.reduce((sum, day) => sum + day.requestCount, 0);

	// Get first and last request from API key metadata
	let firstRequest: string | undefined;
	let lastRequest: string | undefined;

	try {
		const keyData = await apiKeysKV.get(`key:${apiKey}`);
		if (keyData) {
			const parsed = JSON.parse(keyData);
			firstRequest = parsed.createdAt;
			lastRequest = parsed.lastUsed;
		}
	} catch (error) {
		console.error('Failed to get API key metadata:', error);
	}

	return {
		apiKey,
		totalRequests,
		todayRequests,
		thisWeekRequests,
		thisMonthRequests,
		firstRequest,
		lastRequest,
		dailyBreakdown,
	};
}

/**
 * Get statistics for multiple API keys
 * @param apiKeys - Array of API keys
 * @param statsKV - KV namespace for statistics
 * @param apiKeysKV - KV namespace for API keys
 * @returns Array of statistics summaries
 */
export async function getMultipleKeyStatistics(
	apiKeys: string[],
	statsKV: KVNamespace,
	apiKeysKV: KVNamespace
): Promise<StatisticsSummary[]> {
	const promises = apiKeys.map((key) =>
		getStatisticsSummary(key, statsKV, apiKeysKV)
	);
	return Promise.all(promises);
}

