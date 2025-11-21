/**
 * getlogo.dev API provider
 * Documentation: https://getlogo.dev/
 */

export interface LogoProviderResult {
	success: boolean;
	logoUrl?: string;
	error?: string;
	provider: string;
}

export interface LogoProviderOptions {
	domain?: string;
	companyName?: string;
	size?: number;
	format?: 'png' | 'svg' | 'webp';
	greyscale?: boolean;
	apiKey?: string;
}

/**
 * Fetch logo from getlogo.dev API
 * @param options - Logo fetch options
 * @returns Logo URL or error
 */
export async function fetchLogoFromGetLogo(
	options: LogoProviderOptions
): Promise<LogoProviderResult> {
	const { domain, companyName, size = 256, format = 'png', greyscale, apiKey } = options;

	try {
		// getlogo.dev uses domain-based URLs
		// Format: https://getlogo.dev/logos/{domain}?token={apiKey}&size={size}
		let logoUrl: string;

		if (domain) {
			// Remove protocol and www if present
			const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
			logoUrl = `https://getlogo.dev/logos/${cleanDomain}`;
		} else if (companyName) {
			// Try with company name as domain
			const cleanName = companyName.toLowerCase().replace(/\s+/g, '');
			logoUrl = `https://getlogo.dev/logos/${cleanName}.com`;
		} else {
			return {
				success: false,
				error: 'Either domain or companyName must be provided',
				provider: 'getlogo.dev',
			};
		}

		// Build query parameters
		const params = new URLSearchParams();
		if (apiKey) {
			params.append('token', apiKey);
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
			},
		});

		if (!response.ok) {
			if (response.status === 404) {
				return {
					success: false,
					error: 'Logo not found',
					provider: 'getlogo.dev',
				};
			}
			if (response.status === 429) {
				return {
					success: false,
					error: 'Rate limit exceeded',
					provider: 'getlogo.dev',
				};
			}
			return {
				success: false,
				error: `HTTP ${response.status}: ${response.statusText}`,
				provider: 'getlogo.dev',
			};
		}

		// Check if response is actually an image
		const contentType = response.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			return {
				success: false,
				error: 'Response is not an image',
				provider: 'getlogo.dev',
			};
		}

		return {
			success: true,
			logoUrl: fullUrl,
			provider: 'getlogo.dev',
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			provider: 'getlogo.dev',
		};
	}
}

