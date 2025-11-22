/**
 * Logo Provider Abstraction
 * Unified interface for all logo providers
 */

import { fetchLogoFromGetLogo, type LogoProviderResult, type LogoProviderOptions } from './getlogo';
import { fetchLogoFromLogoDev } from './logodev';
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
					const logoResponse = await fetch(result.logoUrl);
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

	// If no success yet and we have a domain, try Google Favicon as last resort
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

	// If we have successful results, select the largest one
	if (successfulResults.length > 0) {
		// Sort by file size (largest first), or by duration (fastest first) if no size info
		successfulResults.sort((a, b) => {
			if (a.fileSize && b.fileSize) {
				return b.fileSize - a.fileSize; // Largest first
			}
			if (a.duration && b.duration) {
				return a.duration - b.duration; // Fastest first
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

