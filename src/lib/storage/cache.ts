/**
 * Cache invalidation and management utilities
 */

import type { LogoMetadata } from './r2';
import { generateLogoKey, generateMetadataKey } from './r2';
import { generateKVMetadataKey, deleteMetadataFromKV } from './kv';

export interface CacheInvalidationOptions {
	maxAge?: number; // Maximum age in seconds (default: 30 days)
	force?: boolean; // Force invalidation regardless of age
}

/**
 * Check if logo metadata is stale
 * @param metadata - Logo metadata
 * @param maxAge - Maximum age in seconds (default: 30 days)
 * @returns True if metadata is stale
 */
export function isMetadataStale(metadata: LogoMetadata, maxAge = 2592000): boolean {
	const retrievedAt = new Date(metadata.retrievedAt);
	const now = new Date();
	const ageInSeconds = (now.getTime() - retrievedAt.getTime()) / 1000;
	return ageInSeconds > maxAge;
}

/**
 * Invalidate logo cache in R2 and KV
 * @param r2Bucket - R2 bucket binding
 * @param kvNamespace - KV namespace binding
 * @param domain - Domain name
 * @param companyName - Company name
 * @param format - Image format
 * @param size - Logo size
 * @returns Success status
 */
export async function invalidateLogoCache(
	r2Bucket: R2Bucket,
	kvNamespace: KVNamespace,
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): Promise<boolean> {
	try {
		// Delete from R2
		const logoKey = generateLogoKey(domain, companyName, format);
		const metadataKey = generateMetadataKey(domain, companyName);

		await r2Bucket.delete(logoKey);
		await r2Bucket.delete(metadataKey);

		// Delete from KV
		await deleteMetadataFromKV(kvNamespace, domain, companyName, format, size);

		return true;
	} catch (error) {
		console.error('Failed to invalidate logo cache:', error);
		return false;
	}
}

/**
 * Invalidate stale logos based on age
 * @param r2Bucket - R2 bucket binding
 * @param kvNamespace - KV namespace binding
 * @param metadata - Logo metadata to check
 * @param options - Invalidation options
 * @returns True if invalidated
 */
export async function invalidateStaleLogo(
	r2Bucket: R2Bucket,
	kvNamespace: KVNamespace,
	metadata: LogoMetadata,
	options: CacheInvalidationOptions = {}
): Promise<boolean> {
	const { maxAge = 2592000, force = false } = options;

	if (force || isMetadataStale(metadata, maxAge)) {
		return await invalidateLogoCache(
			r2Bucket,
			kvNamespace,
			metadata.domain,
			metadata.companyName,
			metadata.format,
			metadata.size
		);
	}

	return false;
}

/**
 * Get cache control headers for logo response
 * @param metadata - Logo metadata
 * @param maxAge - Maximum cache age in seconds (default: 1 year)
 * @returns Cache control headers
 */
export function getCacheControlHeaders(metadata?: LogoMetadata, maxAge = 31536000): Headers {
	const headers = new Headers();
	headers.set('Cache-Control', `public, max-age=${maxAge}, immutable`);
	headers.set('X-Content-Type-Options', 'nosniff');

	if (metadata) {
		// Don't expose provider name to users for security
		// headers.set('X-Logo-Provider', metadata.provider);
		headers.set('X-Logo-Retrieved-At', metadata.retrievedAt);
	}

	return headers;
}

