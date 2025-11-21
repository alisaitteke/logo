/**
 * KV Storage utilities for logo metadata caching
 */

import type { LogoMetadata } from './r2';

/**
 * Generate KV key for logo metadata
 * @param domain - Domain name
 * @param companyName - Company name
 * @param format - Image format
 * @param size - Logo size
 * @returns KV key
 */
export function generateKVMetadataKey(
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): string {
	if (domain) {
		const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
		const sizeSuffix = size ? `_${size}` : '';
		return `logo:${cleanDomain}:${format}${sizeSuffix}`;
	}
	if (companyName) {
		const cleanName = companyName.toLowerCase().replace(/\s+/g, '-');
		const sizeSuffix = size ? `_${size}` : '';
		return `logo:name:${cleanName}:${format}${sizeSuffix}`;
	}
	throw new Error('Either domain or companyName must be provided');
}

/**
 * Store logo metadata in KV
 * @param kvNamespace - KV namespace binding
 * @param metadata - Logo metadata
 * @returns Success status
 */
export async function storeMetadataInKV(
	kvNamespace: KVNamespace,
	metadata: LogoMetadata
): Promise<boolean> {
	try {
		const key = generateKVMetadataKey(
			metadata.domain,
			metadata.companyName,
			metadata.format,
			metadata.size
		);

		const metadataJson = JSON.stringify(metadata);
		await kvNamespace.put(key, metadataJson, {
			expirationTtl: 31536000, // 1 year TTL
		});

		return true;
	} catch (error) {
		console.error('Failed to store metadata in KV:', error);
		return false;
	}
}

/**
 * Retrieve logo metadata from KV
 * @param kvNamespace - KV namespace binding
 * @param domain - Domain name
 * @param companyName - Company name
 * @param format - Image format
 * @param size - Logo size
 * @returns Metadata or null if not found
 */
export async function getMetadataFromKV(
	kvNamespace: KVNamespace,
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): Promise<LogoMetadata | null> {
	try {
		const key = generateKVMetadataKey(domain, companyName, format, size);
		const metadataJson = await kvNamespace.get(key);

		if (!metadataJson) {
			return null;
		}

		return JSON.parse(metadataJson) as LogoMetadata;
	} catch (error) {
		console.error('Failed to retrieve metadata from KV:', error);
		return null;
	}
}

/**
 * Delete logo metadata from KV
 * @param kvNamespace - KV namespace binding
 * @param domain - Domain name
 * @param companyName - Company name
 * @param format - Image format
 * @param size - Logo size
 * @returns Success status
 */
export async function deleteMetadataFromKV(
	kvNamespace: KVNamespace,
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): Promise<boolean> {
	try {
		const key = generateKVMetadataKey(domain, companyName, format, size);
		await kvNamespace.delete(key);
		return true;
	} catch (error) {
		console.error('Failed to delete metadata from KV:', error);
		return false;
	}
}

/**
 * Check if metadata exists in KV
 * @param kvNamespace - KV namespace binding
 * @param domain - Domain name
 * @param companyName - Company name
 * @param format - Image format
 * @param size - Logo size
 * @returns True if metadata exists
 */
export async function metadataExistsInKV(
	kvNamespace: KVNamespace,
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): Promise<boolean> {
	try {
		const key = generateKVMetadataKey(domain, companyName, format, size);
		const value = await kvNamespace.get(key);
		return value !== null;
	} catch (error) {
		return false;
	}
}

