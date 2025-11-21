/**
 * logo.dev API provider
 * Alternative logo provider with similar API
 */

import type { LogoProviderResult, LogoProviderOptions } from './getlogo';

/**
 * Fetch logo from logo.dev API
 * @param options - Logo fetch options
 * @returns Logo URL or error
 */
export async function fetchLogoFromLogoDev(
	options: LogoProviderOptions
): Promise<LogoProviderResult> {
	const { domain, companyName, size = 256, format = 'png', greyscale, apiKey } = options;

	try {
		// logo.dev API format (assuming similar to getlogo.dev)
		// Format may vary, adjust based on actual API documentation
		let logoUrl: string;

		if (domain) {
			const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
			logoUrl = `https://logo.dev/api/v1/logo/${cleanDomain}`;
		} else if (companyName) {
			const cleanName = companyName.toLowerCase().replace(/\s+/g, '');
			logoUrl = `https://logo.dev/api/v1/logo/${cleanName}`;
		} else {
			return {
				success: false,
				error: 'Either domain or companyName must be provided',
				provider: 'logo.dev',
			};
		}

		// Build query parameters
		const params = new URLSearchParams();
		if (apiKey) {
			params.append('key', apiKey);
		}
		if (size) {
			params.append('size', size.toString());
		}
		if (format) {
			params.append('format', format);
		}
		if (greyscale) {
			params.append('greyscale', 'true');
		}

		const fullUrl = `${logoUrl}?${params.toString()}`;

		// Fetch the logo to verify it exists
		const response = await fetch(fullUrl, {
			method: 'GET',
			headers: {
				'User-Agent': 'LogoCDN/1.0',
				'Accept': 'image/*',
			},
		});

		if (!response.ok) {
			if (response.status === 404) {
				return {
					success: false,
					error: 'Logo not found',
					provider: 'logo.dev',
				};
			}
			if (response.status === 429) {
				return {
					success: false,
					error: 'Rate limit exceeded',
					provider: 'logo.dev',
				};
			}
			return {
				success: false,
				error: `HTTP ${response.status}: ${response.statusText}`,
				provider: 'logo.dev',
			};
		}

		// Check if response is actually an image
		const contentType = response.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			// Consume body to prevent stalled response warning
			await response.arrayBuffer().catch(() => {});
			return {
				success: false,
				error: 'Response is not an image',
				provider: 'logo.dev',
			};
		}

		// Consume body to prevent stalled response warning
		await response.arrayBuffer().catch(() => {});

		return {
			success: true,
			logoUrl: fullUrl,
			provider: 'logo.dev',
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			provider: 'logo.dev',
		};
	}
}

