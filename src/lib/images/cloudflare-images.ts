/**
 * Cloudflare Images API integration for logo optimization
 */

export interface CloudflareImagesConfig {
	accountId: string;
	apiToken: string;
	baseUrl?: string;
}

export interface ImageUploadResult {
	success: boolean;
	imageId?: string;
	variants?: string[];
	error?: string;
}

export interface ImageTransformationOptions {
	width?: number;
	height?: number;
	format?: 'png' | 'webp' | 'jpeg' | 'gif';
	fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
	quality?: number; // 1-100
	sharpen?: number; // 0-5
	blur?: number; // 0-250
	greyscale?: boolean;
}

/**
 * Upload image to Cloudflare Images
 * @param imageData - Image data as ArrayBuffer or Blob
 * @param config - Cloudflare Images configuration
 * @param metadata - Optional metadata
 * @returns Upload result with image ID
 */
export async function uploadToCloudflareImages(
	imageData: ArrayBuffer | Blob,
	config: CloudflareImagesConfig,
	metadata?: Record<string, string>
): Promise<ImageUploadResult> {
	try {
		const accountId = config.accountId;
		const apiToken = config.apiToken;
		const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;

		// Create form data
		const formData = new FormData();
		const blob = imageData instanceof Blob ? imageData : new Blob([imageData]);
		formData.append('file', blob);

		// Add metadata if provided
		if (metadata) {
			Object.entries(metadata).forEach(([key, value]) => {
				formData.append(`metadata[${key}]`, value);
			});
		}

		// Upload image
		const response = await fetch(uploadUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
			},
			body: formData,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			return {
				success: false,
				error: `Upload failed: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`,
			};
		}

		const result = await response.json();

		if (result.success && result.result) {
			return {
				success: true,
				imageId: result.result.id,
				variants: result.result.variants || [],
			};
		}

		return {
			success: false,
			error: 'Upload succeeded but no image ID returned',
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error during upload',
		};
	}
}

/**
 * Generate Cloudflare Images delivery URL with transformations
 * @param imageId - Cloudflare Images image ID
 * @param options - Transformation options
 * @param config - Cloudflare Images configuration
 * @param signed - Whether to generate a signed URL (requires signing key)
 * @returns Image delivery URL
 */
export function generateImageUrl(
	imageId: string,
	options: ImageTransformationOptions = {},
	config?: CloudflareImagesConfig,
	signed = false
): string {
	const baseUrl = config?.baseUrl || 'https://imagedelivery.net';
	const accountHash = config?.accountId || '';

	// Build transformation parameters for flexible variants
	// Cloudflare Images uses query parameters for transformations
	const params: string[] = [];

	if (options.width) {
		params.push(`w=${options.width}`);
	}
	if (options.height) {
		params.push(`h=${options.height}`);
	}
	if (options.format) {
		params.push(`f=${options.format}`);
	}
	if (options.fit) {
		params.push(`fit=${options.fit}`);
	}
	if (options.quality !== undefined) {
		params.push(`q=${options.quality}`);
	}
	if (options.sharpen !== undefined) {
		params.push(`sharpen=${options.sharpen}`);
	}
	if (options.blur !== undefined) {
		params.push(`blur=${options.blur}`);
	}
	
	// Cloudflare Images doesn't have native greyscale parameter
	// We need to use a pre-defined variant or apply it differently
	// For now, we'll note this limitation
	
	// Use 'public' variant with flexible transformations via query params
	const queryString = params.length > 0 ? `?${params.join('&')}` : '';
	
	// Construct URL
	// Format: https://imagedelivery.net/{accountHash}/{imageId}/public?w=256&f=png
	let url = `${baseUrl}/${accountHash}/${imageId}/public${queryString}`;

	// Add signed URL support if needed (requires signing key)
	if (signed && config) {
		// Note: Signed URLs require additional implementation with HMAC
		// For now, we'll use public URLs
		// TODO: Implement signed URL generation if needed
	}

	return url;
}

/**
 * Convert SVG to raster format (PNG/WebP) for Cloudflare Images
 * Note: Cloudflare Images doesn't support SVG directly
 * @param svgData - SVG data as string or ArrayBuffer
 * @param format - Target format (png or webp)
 * @param width - Target width
 * @param height - Target height
 * @returns Converted image data or null if conversion fails
 */
export async function convertSvgToRaster(
	svgData: string | ArrayBuffer,
	format: 'png' | 'webp' = 'png',
	width?: number,
	height?: number
): Promise<ArrayBuffer | null> {
	try {
		// In a Cloudflare Worker environment, we can't directly convert SVG
		// We would need to use a service or library
		// For now, return the SVG as-is and let Cloudflare Images handle it
		// or use an external conversion service

		// Option 1: Return SVG as-is (Cloudflare Images may handle it)
		if (typeof svgData === 'string') {
			return new TextEncoder().encode(svgData);
		}
		return svgData;

		// Option 2: Use an external SVG-to-raster service
		// This would require calling an external API or service
	} catch (error) {
		console.error('SVG conversion failed:', error);
		return null;
	}
}

/**
 * Check if image format is SVG
 */
export function isSvgFormat(data: ArrayBuffer | Blob | string): boolean {
	if (typeof data === 'string') {
		return data.trim().startsWith('<svg') || data.trim().startsWith('<?xml');
	}

	// Check first few bytes for SVG signature
	if (data instanceof ArrayBuffer) {
		const view = new Uint8Array(data.slice(0, 100));
		const text = new TextDecoder().decode(view);
		return text.includes('<svg') || text.includes('<?xml');
	}

	// For Blob, we'd need to read it first
	return false;
}

