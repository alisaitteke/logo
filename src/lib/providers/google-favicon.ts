/**
 * Google Favicon Service provider
 * Fetches favicons from Google's favicon service
 */

export interface GoogleFaviconOptions {
	domain: string;
	size?: number;
}

/**
 * Fetch favicon from Google's service
 * @param options - Fetch options
 * @returns Logo data or null if not found
 */
export async function fetchLogoFromGoogleFavicon(
	options: GoogleFaviconOptions
): Promise<{ success: boolean; logoData?: ArrayBuffer; error?: string }> {
	try {
		const { domain, size = 256 } = options;

		// Google Favicon API
		// https://www.google.com/s2/favicons?domain=example.com&sz=256
		const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; LogoCDN/1.0)',
			},
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Google Favicon returned ${response.status}`,
			};
		}

		const contentType = response.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			return {
				success: false,
				error: 'Invalid content type from Google Favicon',
			};
		}

		const logoData = await response.arrayBuffer();

		// Check if it's a valid image (not empty or too small)
		if (logoData.byteLength < 100) {
			return {
				success: false,
				error: 'Image too small or invalid',
			};
		}

		return {
			success: true,
			logoData,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

