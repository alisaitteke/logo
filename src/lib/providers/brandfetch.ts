/**
 * Brandfetch API provider
 * Documentation: https://docs.brandfetch.com/
 */

import type { LogoProviderOptions, LogoProviderResult } from './getlogo';

/**
 * Search for a brand by name using Brandfetch API
 * @param companyName - Company name to search
 * @param apiKey - Brandfetch API key
 * @returns Brand domain or null
 */
async function searchBrand(companyName: string, apiKey?: string): Promise<string | null> {
	try {
		const searchUrl = `https://api.brandfetch.io/v2/search/${encodeURIComponent(companyName)}`;
		
		const headers: Record<string, string> = {
			'Accept': 'application/json',
		};
		
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
		
		const response = await fetch(searchUrl, { headers });
		
		if (!response.ok) {
			console.log(`[Brandfetch] Search returned ${response.status}`);
			return null;
		}
		
		const data = await response.json();
		
		// Get first result's domain
		if (Array.isArray(data) && data.length > 0 && data[0].domain) {
			return data[0].domain;
		}
		
		return null;
	} catch (error) {
		console.error('[Brandfetch] Search failed:', error);
		return null;
	}
}

/**
 * Fetch logo from Brandfetch API
 * @param options - Logo fetch options
 * @returns Logo URL or error
 */
export async function fetchLogoFromBrandfetch(
	options: LogoProviderOptions
): Promise<LogoProviderResult> {
	const { companyName, apiKey } = options;
	
	try {
		console.log(`[Brandfetch] Starting fetch for: "${companyName}"`);
		
		if (!companyName) {
			console.log('[Brandfetch] Error: Company name required');
			return {
				success: false,
				error: 'Company name required for Brandfetch',
				provider: 'brandfetch',
			};
		}
		
		console.log(`[Brandfetch] Searching for: "${companyName}"`);
		
		// Search for brand to get domain
		const domain = await searchBrand(companyName, apiKey);
		
		console.log(`[Brandfetch] Search result: ${domain || 'null'}`);
		
		if (!domain) {
			return {
				success: false,
				error: `Brand not found for "${companyName}"`,
				provider: 'brandfetch',
			};
		}
		
		console.log(`[Brandfetch] Found domain: ${domain}`);
		
		// Fetch brand data
		const brandUrl = `https://api.brandfetch.io/v2/brands/${domain}`;
		
		const headers: Record<string, string> = {
			'Accept': 'application/json',
		};
		
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
		
		const response = await fetch(brandUrl, { headers });
		
		if (!response.ok) {
			return {
				success: false,
				error: `HTTP ${response.status}`,
				provider: 'brandfetch',
			};
		}
		
		const brandData = await response.json();
		
		// Extract logo URL (prefer SVG, then PNG)
		let logoUrl: string | null = null;
		
		if (brandData.logos && Array.isArray(brandData.logos)) {
			// Try to find SVG first
			const svgLogo = brandData.logos.find((logo: any) => 
				logo.formats && logo.formats.some((f: any) => f.format === 'svg')
			);
			
			if (svgLogo && svgLogo.formats) {
				const svgFormat = svgLogo.formats.find((f: any) => f.format === 'svg');
				if (svgFormat && svgFormat.src) {
					logoUrl = svgFormat.src;
				}
			}
			
			// If no SVG, try PNG
			if (!logoUrl) {
				const pngLogo = brandData.logos.find((logo: any) => 
					logo.formats && logo.formats.some((f: any) => f.format === 'png')
				);
				
				if (pngLogo && pngLogo.formats) {
					const pngFormat = pngLogo.formats.find((f: any) => f.format === 'png');
					if (pngFormat && pngFormat.src) {
						logoUrl = pngFormat.src;
					}
				}
			}
		}
		
		if (!logoUrl) {
			return {
				success: false,
				error: 'No logo found in brand data',
				provider: 'brandfetch',
			};
		}
		
		// Verify the logo is accessible
		const logoResponse = await fetch(logoUrl);
		
		if (!logoResponse.ok) {
			return {
				success: false,
				error: `Logo not accessible: HTTP ${logoResponse.status}`,
				provider: 'brandfetch',
			};
		}
		
		const contentType = logoResponse.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			await logoResponse.arrayBuffer().catch(() => {});
			return {
				success: false,
				error: 'Response is not an image',
				provider: 'brandfetch',
			};
		}
		
		// Consume body
		await logoResponse.arrayBuffer().catch(() => {});
		
		return {
			success: true,
			logoUrl: logoUrl,
			provider: 'brandfetch',
		};
	} catch (error) {
		console.error('[Brandfetch] Unexpected error:', error);
		console.error('[Brandfetch] Error stack:', error instanceof Error ? error.stack : 'No stack');
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			provider: 'brandfetch',
		};
	}
}

