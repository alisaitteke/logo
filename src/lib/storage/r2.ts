/**
 * R2 Storage utilities for logo caching
 */

export interface LogoMetadata {
	provider: string;
	retrievedAt: string;
	responseTime?: number;
	originalUrl: string;
	domain?: string;
	companyName?: string;
	size?: number;
	format?: string;
	width?: number;
	height?: number;
	fileSize?: number;
}

export interface StoredLogo {
	logo: ArrayBuffer;
	metadata: LogoMetadata;
}

/**
 * Generate R2 key for logo storage
 * @param domain - Domain name
 * @param companyName - Company name (if domain not available)
 * @param format - Image format
 * @param size - Logo size (optional, for size-specific variants)
 * @returns R2 key path
 */
export function generateLogoKey(
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): string {
	if (domain) {
		const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
		const sizeSuffix = size ? `_${size}` : '';
		return `logos/${cleanDomain}${sizeSuffix}.${format}`;
	}
	if (companyName) {
		const cleanName = companyName.toLowerCase().replace(/\s+/g, '-');
		const sizeSuffix = size ? `_${size}` : '';
		return `logos/name/${cleanName}${sizeSuffix}.${format}`;
	}
	throw new Error('Either domain or companyName must be provided');
}

/**
 * Generate metadata key for logo
 * @param domain - Domain name
 * @param companyName - Company name
 * @returns Metadata key path
 */
export function generateMetadataKey(domain?: string, companyName?: string): string {
	if (domain) {
		const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
		return `metadata/${cleanDomain}.json`;
	}
	if (companyName) {
		const cleanName = companyName.toLowerCase().replace(/\s+/g, '-');
		return `metadata/name/${cleanName}.json`;
	}
	throw new Error('Either domain or companyName must be provided');
}

/**
 * Store logo and metadata in R2
 * @param r2Bucket - R2 bucket binding
 * @param logo - Logo data as ArrayBuffer
 * @param metadata - Logo metadata
 * @returns Success status
 */
export async function storeLogoInR2(
	r2Bucket: R2Bucket,
	logo: ArrayBuffer,
	metadata: LogoMetadata
): Promise<boolean> {
	try {
		const logoKey = generateLogoKey(
			metadata.domain,
			metadata.companyName,
			metadata.format,
			metadata.size
		);
		const metadataKey = generateMetadataKey(metadata.domain, metadata.companyName);

		// Store logo
		await r2Bucket.put(logoKey, logo, {
			httpMetadata: {
				contentType: `image/${metadata.format || 'png'}`,
				cacheControl: 'public, max-age=31536000', // 1 year cache
			},
			customMetadata: {
				provider: metadata.provider,
				retrievedAt: metadata.retrievedAt,
			},
		});

		// Store metadata as JSON
		const metadataJson = JSON.stringify(metadata, null, 2);
		await r2Bucket.put(metadataKey, metadataJson, {
			httpMetadata: {
				contentType: 'application/json',
				cacheControl: 'public, max-age=3600', // 1 hour cache for metadata
			},
		});

		return true;
	} catch (error) {
		console.error('Failed to store logo in R2:', error);
		return false;
	}
}

/**
 * Retrieve logo from R2
 * @param r2Bucket - R2 bucket binding
 * @param domain - Domain name
 * @param companyName - Company name
 * @param format - Image format
 * @returns Logo data or null if not found
 */
export async function getLogoFromR2(
	r2Bucket: R2Bucket,
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): Promise<ArrayBuffer | null> {
	try {
		const key = generateLogoKey(domain, companyName, format, size);
		const object = await r2Bucket.get(key);

		if (!object) {
			return null;
		}

		return await object.arrayBuffer();
	} catch (error) {
		console.error('Failed to retrieve logo from R2:', error);
		return null;
	}
}

/**
 * Retrieve metadata from R2
 * @param r2Bucket - R2 bucket binding
 * @param domain - Domain name
 * @param companyName - Company name
 * @returns Metadata or null if not found
 */
export async function getMetadataFromR2(
	r2Bucket: R2Bucket,
	domain?: string,
	companyName?: string
): Promise<LogoMetadata | null> {
	try {
		const key = generateMetadataKey(domain, companyName);
		const object = await r2Bucket.get(key);

		if (!object) {
			return null;
		}

		const metadataJson = await object.text();
		return JSON.parse(metadataJson) as LogoMetadata;
	} catch (error) {
		console.error('Failed to retrieve metadata from R2:', error);
		return null;
	}
}

/**
 * Check if logo exists in R2
 * @param r2Bucket - R2 bucket binding
 * @param domain - Domain name
 * @param companyName - Company name
 * @param format - Image format
 * @returns True if logo exists
 */
export async function logoExistsInR2(
	r2Bucket: R2Bucket,
	domain?: string,
	companyName?: string,
	format = 'png',
	size?: number
): Promise<boolean> {
	try {
		const key = generateLogoKey(domain, companyName, format, size);
		const object = await r2Bucket.head(key);
		return object !== null;
	} catch (error) {
		return false;
	}
}

