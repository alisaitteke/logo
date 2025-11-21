/**
 * Main logo fetching service with failover, caching, and storage
 */

import { fetchLogoWithFailover, type EnhancedLogoResult, type LogoProviderOptions } from './providers';
import { findDomainFromCompanyName } from './search/domain-finder';
import {
	storeLogoInR2,
	getLogoFromR2,
	logoExistsInR2,
	getMetadataFromR2,
	type LogoMetadata,
} from './storage/r2';
import {
	storeMetadataInKV,
	getMetadataFromKV,
	metadataExistsInKV,
} from './storage/kv';
import {
	invalidateStaleLogo,
	getCacheControlHeaders,
	isMetadataStale,
} from './storage/cache';
import { createStoreLog, logProviderOperation } from './logging/logger';
import {
	uploadToCloudflareImages,
	generateImageUrl,
	isSvgFormat,
	convertSvgToRaster,
	type ImageTransformationOptions,
} from './images/cloudflare-images';

export interface FetchLogoOptions extends LogoProviderOptions {
	useCache?: boolean;
	r2Bucket?: R2Bucket;
	kvNamespace?: KVNamespace;
	maxCacheAge?: number; // Maximum cache age in seconds
	useCloudflareImages?: boolean; // Use Cloudflare Images for optimization
	cloudflareImagesConfig?: {
		accountId: string;
		apiToken: string;
		baseUrl?: string;
	};
}

export interface FetchLogoResult {
	success: boolean;
	logo?: ArrayBuffer;
	logoUrl?: string;
	cloudflareImagesUrl?: string; // Optimized Cloudflare Images URL
	metadata?: LogoMetadata;
	error?: string;
	fromCache?: boolean;
}

/**
 * Fetch logo with failover, caching, and storage
 * @param options - Logo fetch options including R2 bucket for caching
 * @returns Logo data and metadata
 */
export async function fetchLogo(options: FetchLogoOptions): Promise<FetchLogoResult> {
	const {
		useCache = true,
		r2Bucket,
		kvNamespace,
		maxCacheAge = 2592000, // 30 days default
		domain,
		companyName,
		format = 'png',
		size,
		...providerOptions
	} = options;

	// Check cache first if enabled
	if (useCache && r2Bucket) {
		// Check KV for quick metadata lookup
		let metadata: LogoMetadata | null = null;
		if (kvNamespace) {
			metadata = await getMetadataFromKV(kvNamespace, domain, companyName, format, size);
		}

		// If no KV metadata, try R2 metadata
		if (!metadata) {
			metadata = await getMetadataFromR2(r2Bucket, domain, companyName);
		}

		// Check if cached logo exists and is not stale
		if (metadata) {
			if (!isMetadataStale(metadata, maxCacheAge)) {
				const cachedLogo = await getLogoFromR2(r2Bucket, domain, companyName, format, size);
				if (cachedLogo) {
					return {
						success: true,
						logo: cachedLogo,
						metadata,
						fromCache: true,
					};
				}
			} else {
				// Logo is stale, invalidate cache
				if (kvNamespace) {
					await invalidateStaleLogo(r2Bucket, kvNamespace, metadata, { maxAge: maxCacheAge });
				}
			}
		} else {
			// Try direct R2 lookup
			const cachedLogo = await getLogoFromR2(r2Bucket, domain, companyName, format, size);
			if (cachedLogo) {
				return {
					success: true,
					logo: cachedLogo,
					fromCache: true,
				};
			}
		}
	}

	// Fetch from providers with failover
	const startTime = Date.now();
	let result = await fetchLogoWithFailover({
		domain,
		companyName,
		format,
		...providerOptions,
	});
	const fetchDuration = Date.now() - startTime;

	// If all providers failed and we have a company name (no domain), try to find domain via search
	if (!result.success && !domain && companyName) {
		console.log(`All providers failed. Attempting to find domain for company: ${companyName}`);
		const foundDomain = await findDomainFromCompanyName(companyName);
		
		if (foundDomain) {
			console.log(`Found domain via search: ${foundDomain}`);
			
			// Retry with found domain
			const retryStartTime = Date.now();
			result = await fetchLogoWithFailover({
				domain: foundDomain,
				companyName,
				format,
				...providerOptions,
			});
			
			console.log(`Retry with domain ${foundDomain}: ${result.success ? 'success' : 'failed'}`);
		} else {
			console.log(`Could not find domain for company: ${companyName}`);
		}
	}

	if (!result.success || !result.logoUrl) {
		return {
			success: false,
			error: result.error || 'Failed to fetch logo from all providers',
		};
	}

	// If we have logo data, store it in R2 and KV, optionally upload to Cloudflare Images
	if (result.logoData && r2Bucket) {
		const metadata: LogoMetadata = {
			provider: result.provider,
			retrievedAt: new Date().toISOString(),
			responseTime: result.duration,
			originalUrl: result.logoUrl,
			domain,
			companyName,
			size: size || providerOptions.size,
			format,
			width: result.width,
			height: result.height,
			fileSize: result.fileSize,
		};

		const storeStartTime = Date.now();
		const stored = await storeLogoInR2(r2Bucket, result.logoData, metadata);

		// Also store in KV for quick lookup
		if (stored && kvNamespace) {
			await storeMetadataInKV(kvNamespace, metadata);
		}

		// Upload to Cloudflare Images if enabled
		let cloudflareImagesUrl: string | undefined;
		if (
			options.useCloudflareImages &&
			options.cloudflareImagesConfig &&
			result.logoData
		) {
			try {
				// Check if SVG and convert if needed
				let imageData = result.logoData;
				if (isSvgFormat(imageData)) {
					const converted = await convertSvgToRaster(
						imageData,
						format === 'webp' ? 'webp' : 'png',
						size,
						size
					);
					if (converted) {
						imageData = converted;
					}
				}

				// Upload to Cloudflare Images
				const uploadResult = await uploadToCloudflareImages(
					imageData,
					options.cloudflareImagesConfig,
					{
						domain: domain || '',
						companyName: companyName || '',
						provider: result.provider,
					}
				);

				if (uploadResult.success && uploadResult.imageId) {
					// Generate transformation URL
					const transformationOptions: ImageTransformationOptions = {
						width: size,
						height: size,
						format: format === 'svg' ? 'png' : format,
						greyscale: providerOptions.greyscale,
					};

					cloudflareImagesUrl = generateImageUrl(
						uploadResult.imageId,
						transformationOptions,
						options.cloudflareImagesConfig
					);
				}
			} catch (error) {
				console.error('Cloudflare Images upload failed:', error);
				// Continue without Cloudflare Images URL
			}
		}

		const storeDuration = Date.now() - storeStartTime;

		logProviderOperation(
			createStoreLog(result.provider, stored, {
				domain,
				companyName,
				duration: storeDuration,
				metadata: { format, fileSize: result.fileSize, cloudflareImages: !!cloudflareImagesUrl },
			})
		);

		if (stored) {
			return {
				success: true,
				logo: result.logoData,
				logoUrl: result.logoUrl,
				cloudflareImagesUrl,
				metadata,
				fromCache: false,
			};
		}
	}

	// If storage failed but we have a URL, return it
	return {
		success: true,
		logoUrl: result.logoUrl,
		fromCache: false,
	};
}

