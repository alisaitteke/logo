/**
 * Logo Provider Abstraction
 * Unified interface for all logo providers
 */

import { fetchLogoFromGetLogo, type LogoProviderResult, type LogoProviderOptions } from './getlogo';
import { fetchLogoFromLogoDev } from './logodev';
import { fetchLogoFromWikimedia } from './wikimedia';
import { fetchLogoFromWikipedia } from './wikipedia';
import { fetchLogoFromGoogleFavicon } from './google-favicon';
import { createFetchLog, logProviderOperation } from '../logging/logger';

export type { LogoProviderResult, LogoProviderOptions };

export interface LogoProvider {
	name: string;
	fetch: (options: LogoProviderOptions) => Promise<LogoProviderResult>;
}

export interface EnhancedLogoResult extends LogoProviderResult {
	duration?: number;
	logoData?: ArrayBuffer;
	width?: number;
	height?: number;
	fileSize?: number;
}

/**
 * List of available logo providers in priority order
 */
export const logoProviders: LogoProvider[] = [
	{
		name: 'getlogo.dev',
		fetch: fetchLogoFromGetLogo,
	},
	{
		name: 'logo.dev',
		fetch: fetchLogoFromLogoDev,
	},
	{
		name: 'wikipedia',
		fetch: fetchLogoFromWikipedia,
	},
	{
		name: 'wikimedia',
		fetch: fetchLogoFromWikimedia,
	},
];

/**
 * Fetch logo from multiple providers with failover and logging
 * Tries providers in order until one succeeds
 * @param options - Logo fetch options
 * @param getlogoApiKey - Optional API key for getlogo.dev
 * @param logoDevApiKey - Optional API key for logo.dev
 * @returns Enhanced logo result with metadata
 */
export async function fetchLogoWithFailover(
	options: LogoProviderOptions,
	getlogoApiKey?: string,
	logoDevApiKey?: string
): Promise<EnhancedLogoResult> {
	const errors: string[] = [];
	const successfulResults: EnhancedLogoResult[] = [];

	for (const provider of logoProviders) {
		const startTime = Date.now();
		try {
			// Set the appropriate API key for each provider
			const providerOptions: LogoProviderOptions = {
				...options,
				apiKey: provider.name === 'getlogo.dev' 
					? (getlogoApiKey || options.apiKey)
					: provider.name === 'logo.dev'
					? (logoDevApiKey || options.apiKey)
					: options.apiKey,
			};
			
			const result = await provider.fetch(providerOptions);
			const duration = Date.now() - startTime;

			// Log the attempt
			logProviderOperation(
				createFetchLog(provider.name, result.success, {
					domain: options.domain,
					companyName: options.companyName,
					duration,
					error: result.error,
					metadata: { logoUrl: result.logoUrl },
				})
			);

			if (result.success && result.logoUrl) {
				// Fetch the actual logo data to get size information
				try {
					const logoResponse = await fetch(result.logoUrl, {
						headers: {
							'User-Agent': 'Mozilla/5.0 (compatible; LogoFetcher/1.0)',
						},
					});
					
					if (logoResponse.ok) {
						const logoData = await logoResponse.arrayBuffer();
						const contentType = logoResponse.headers.get('content-type') || '';
						const fileSize = logoData.byteLength;

						// Try to extract dimensions from response headers or image data
						// For now, we'll use file size as a proxy for "largest"
						const enhancedResult: EnhancedLogoResult = {
							...result,
							duration,
							logoData,
							fileSize,
						};

						successfulResults.push(enhancedResult);
					} else {
						// If fetch fails (e.g. 403), still add the result but without data
						console.warn(`Failed to fetch logo data for ${provider.name}: ${logoResponse.status}`);
						const enhancedResult: EnhancedLogoResult = {
							...result,
							duration,
						};
						successfulResults.push(enhancedResult);
					}
				} catch (fetchError) {
					// If we can't fetch the logo data, still return the URL
					const enhancedResult: EnhancedLogoResult = {
						...result,
						duration,
					};
					successfulResults.push(enhancedResult);
				}
			} else {
				errors.push(`${provider.name}: ${result.error || 'Unknown error'}`);
			}
		} catch (error) {
			const duration = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			errors.push(`${provider.name}: ${errorMessage}`);

			logProviderOperation(
				createFetchLog(provider.name, false, {
					domain: options.domain,
					companyName: options.companyName,
					duration,
					error: errorMessage,
				})
			);
		}
	}

	// If no success yet and we have a domain or company name, try Google Favicon as last resort
	if (successfulResults.length === 0 && options.domain) {
		const startTime = Date.now();
		try {
			const result = await fetchLogoFromGoogleFavicon({
				domain: options.domain,
				size: options.size || 256,
			});
			const duration = Date.now() - startTime;

			logProviderOperation(
				createFetchLog('google-favicon', result.success, {
					domain: options.domain,
					duration,
					error: result.error,
				})
			);

			if (result.success && result.logoData) {
				const enhancedResult: EnhancedLogoResult = {
					success: true,
					logoUrl: `https://www.google.com/s2/favicons?domain=${options.domain}&sz=${options.size || 256}`,
					provider: 'google-favicon',
					duration,
					logoData: result.logoData,
					fileSize: result.logoData.byteLength,
				};
				successfulResults.push(enhancedResult);
			}
		} catch (error) {
			console.error('Google Favicon failed:', error);
		}
	}

	// If we have successful results, select the best one
	if (successfulResults.length > 0) {
		// Sort by provider priority first, then format quality, then file size
		successfulResults.sort((a, b) => {
			// Provider priority: Wikipedia > Wikimedia > others > google-favicon
			const getProviderPriority = (result: EnhancedLogoResult): number => {
				if (result.provider === 'wikipedia') return 4;
				if (result.provider === 'wikimedia') return 3;
				if (result.provider === 'google-favicon') return 1;
				return 2; // getlogo.dev, logo.dev
			};

			const providerPriorityA = getProviderPriority(a);
			const providerPriorityB = getProviderPriority(b);

			// First, compare by provider priority
			if (providerPriorityA !== providerPriorityB) {
				return providerPriorityB - providerPriorityA; // Higher priority first
			}

			// Get format from URL or content type
			const getFormat = (result: EnhancedLogoResult): string => {
				const url = result.logoUrl || '';
				if (url.includes('.svg') || url.toLowerCase().includes('svg')) return 'svg';
				if (url.includes('.png') || url.toLowerCase().includes('png')) return 'png';
				if (url.includes('.jpg') || url.includes('.jpeg') || url.toLowerCase().includes('jpeg')) return 'jpg';
				return 'unknown';
			};

			const formatA = getFormat(a);
			const formatB = getFormat(b);

			// Format priority: SVG > PNG > JPG > others
			const formatPriority: Record<string, number> = {
				'svg': 3,
				'png': 2,
				'jpg': 1,
				'unknown': 0,
			};

			const priorityA = formatPriority[formatA] || 0;
			const priorityB = formatPriority[formatB] || 0;

			// Second, compare by format priority
			if (priorityA !== priorityB) {
				return priorityB - priorityA; // Higher priority first
			}

			// Third, compare by file size (larger is better)
			if (a.fileSize && b.fileSize) {
				return b.fileSize - a.fileSize;
			}

			// If no size info, prefer faster response
			if (a.duration && b.duration) {
				return a.duration - b.duration;
			}

			return 0;
		});

		return successfulResults[0];
	}

	// All providers failed
	return {
		success: false,
		error: `All providers failed: ${errors.join('; ')}`,
		provider: 'all',
	};
}

/**
 * Fetch logo from a specific provider
 * @param providerName - Name of the provider to use
 * @param options - Logo fetch options
 * @returns Logo URL or error
 */
export async function fetchLogoFromProvider(
	providerName: string,
	options: LogoProviderOptions
): Promise<LogoProviderResult> {
	const provider = logoProviders.find((p) => p.name === providerName);

	if (!provider) {
		return {
			success: false,
			error: `Provider "${providerName}" not found`,
			provider: 'unknown',
		};
	}

	return provider.fetch(options);
}

