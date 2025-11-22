/**
 * Wikipedia provider
 * Fetches logos from Wikipedia pages (infobox logos)
 * Documentation: https://www.mediawiki.org/wiki/API:Main_page
 */

import type { LogoProviderOptions, LogoProviderResult } from './getlogo';

/**
 * Search for Wikipedia page by company name
 * @param companyName - Company name to search for
 * @returns Wikipedia page title or null
 */
async function findWikipediaPage(companyName: string): Promise<string | null> {
	try {
		// Clean company name
		const cleanName = companyName.trim();

		// Try direct search first
		const searchUrl = `https://en.wikipedia.org/w/api.php?` +
			`action=query&` +
			`list=search&` +
			`srsearch=${encodeURIComponent(cleanName)}&` +
			`srlimit=5&` +
			`format=json&` +
			`origin=*`;

		const response = await fetch(searchUrl, {
			headers: {
				'User-Agent': 'LogoCDN/1.0 (https://github.com/your-repo)',
			},
		});

		if (!response.ok) {
			console.log(`[Wikipedia] Search API returned ${response.status}`);
			return null;
		}

		const data = await response.json();

		if (data.query && data.query.search && data.query.search.length > 0) {
			// Return the first (most relevant) result
			return data.query.search[0].title;
		}

		return null;
	} catch (error) {
		console.error('[Wikipedia] Search failed:', error);
		return null;
	}
}

/**
 * Extract logo from Wikipedia page infobox
 * @param pageTitle - Wikipedia page title
 * @returns Logo URL or null
 */
async function getLogoFromInfobox(pageTitle: string): Promise<string | null> {
	try {
		// Get page content with infobox data
		const apiUrl = `https://en.wikipedia.org/w/api.php?` +
			`action=query&` +
			`titles=${encodeURIComponent(pageTitle)}&` +
			`prop=pageimages|revisions&` +
			`piprop=original&` +
			`rvprop=content&` +
			`rvslots=main&` +
			`format=json&` +
			`origin=*`;

		const response = await fetch(apiUrl, {
			headers: {
				'User-Agent': 'LogoCDN/1.0 (https://github.com/your-repo)',
			},
		});

		if (!response.ok) {
			console.log(`[Wikipedia] Page API returned ${response.status}`);
			return null;
		}

		const data = await response.json();

		if (data.query && data.query.pages) {
			const pages = Object.values(data.query.pages) as Array<{
				pageid?: number;
				original?: { source?: string };
				revisions?: Array<{
					slots?: {
						main?: {
							content?: string;
						};
					};
				}>;
			}>;

			for (const page of pages) {
				// First, try to extract from infobox template (more reliable for logos)
				if (page.revisions && page.revisions.length > 0) {
					const content = page.revisions[0].slots?.main?.content || '';
					
					// Look for infobox logo/image fields (prioritize logo over image)
					// Pattern: | logo = [[File:Logo.svg|...]]
					// Pattern: | logotype = [[File:Logo.svg|...]]
					// Pattern: | image = [[File:Logo.png|...]] (fallback, but check if it's actually a logo)
					
					// Try logo first
					let logoMatch = content.match(/\|\s*logo\s*=\s*\[\[File:([^\|\]]+)/i);
					if (!logoMatch) {
						// Try logotype
						logoMatch = content.match(/\|\s*logotype\s*=\s*\[\[File:([^\|\]]+)/i);
					}
					
					if (logoMatch && logoMatch[1]) {
						const fileName = logoMatch[1].trim();
						console.log(`[Wikipedia] Found logo in infobox: ${fileName}`);
						
						// Get the file URL from Commons
						const commonsUrl = await getCommonsFileUrl(fileName);
						if (commonsUrl) {
							return commonsUrl;
						}
					}
					
					// Fallback: try image field, but only if filename contains "logo"
					const imageMatch = content.match(/\|\s*image\s*=\s*\[\[File:([^\|\]]+)/i);
					if (imageMatch && imageMatch[1]) {
						const fileName = imageMatch[1].trim();
						// Only use if it's clearly a logo file
						if (fileName.toLowerCase().includes('logo') || fileName.toLowerCase().includes('logotype')) {
							console.log(`[Wikipedia] Found logo via image field: ${fileName}`);
							const commonsUrl = await getCommonsFileUrl(fileName);
							if (commonsUrl) {
								return commonsUrl;
							}
						}
					}
				}
				
				// Last resort: page image (but skip if it looks like a building/photo, not a logo)
				if (page.original && page.original.source) {
					const imageUrl = page.original.source;
					const imageName = imageUrl.toLowerCase();
					// Skip if it's clearly not a logo (contains words like "tower", "building", "headquarters", etc.)
					if (
						!imageName.includes('tower') &&
						!imageName.includes('building') &&
						!imageName.includes('headquarters') &&
						!imageName.includes('office') &&
						!imageName.includes('hq') &&
						(imageName.includes('logo') || imageName.includes('logotype'))
					) {
						console.log(`[Wikipedia] Found page image (likely logo): ${imageUrl}`);
						return imageUrl;
					} else {
						console.log(`[Wikipedia] Skipping page image (not a logo): ${imageUrl}`);
					}
				}
			}
		}

		return null;
	} catch (error) {
		console.error(`[Wikipedia] Failed to get logo from infobox:`, error);
		return null;
	}
}

/**
 * Get file URL from Wikimedia Commons
 * @param fileName - File name (e.g., "Company_logo.svg")
 * @returns Direct URL to the file
 */
async function getCommonsFileUrl(fileName: string): Promise<string | null> {
	try {
		const fileTitle = fileName.startsWith('File:') ? fileName : `File:${fileName}`;

		const apiUrl = `https://commons.wikimedia.org/w/api.php?` +
			`action=query&` +
			`titles=${encodeURIComponent(fileTitle)}&` +
			`prop=imageinfo&` +
			`iiprop=url&` +
			`format=json&` +
			`origin=*`;

		const response = await fetch(apiUrl, {
			headers: {
				'User-Agent': 'LogoCDN/1.0 (https://github.com/your-repo)',
			},
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();

		if (data.query && data.query.pages) {
			const pages = Object.values(data.query.pages) as Array<{
				imageinfo?: Array<{ url?: string }>;
			}>;

			for (const page of pages) {
				if (page.imageinfo && page.imageinfo.length > 0) {
					const url = page.imageinfo[0].url;
					if (url) {
						return url;
					}
				}
			}
		}

		return null;
	} catch (error) {
		console.error(`[Wikipedia] Failed to get Commons file URL for ${fileName}:`, error);
		return null;
	}
}

/**
 * Fetch logo from Wikipedia
 * @param options - Logo fetch options
 * @returns Logo URL or error
 */
export async function fetchLogoFromWikipedia(
	options: LogoProviderOptions
): Promise<LogoProviderResult> {
	const { companyName } = options;

	try {
		if (!companyName) {
			return {
				success: false,
				error: 'companyName is required for Wikipedia search',
				provider: 'wikipedia',
			};
		}

		console.log(`[Wikipedia] Searching for Wikipedia page: "${companyName}"`);

		// Find Wikipedia page
		const pageTitle = await findWikipediaPage(companyName);

		if (!pageTitle) {
			return {
				success: false,
				error: `Wikipedia page not found for "${companyName}"`,
				provider: 'wikipedia',
			};
		}

		console.log(`[Wikipedia] Found page: ${pageTitle}`);

		// Get logo from infobox
		const logoUrl = await getLogoFromInfobox(pageTitle);

		if (!logoUrl) {
			return {
				success: false,
				error: `No logo found in Wikipedia page for "${companyName}"`,
				provider: 'wikipedia',
			};
		}

		// Verify the image exists and is accessible
		const imageResponse = await fetch(logoUrl, {
			headers: {
				'User-Agent': 'LogoCDN/1.0',
			},
		});

		if (!imageResponse.ok) {
			return {
				success: false,
				error: `Image not accessible: HTTP ${imageResponse.status}`,
				provider: 'wikipedia',
			};
		}

		const contentType = imageResponse.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			await imageResponse.arrayBuffer().catch(() => {});
			return {
				success: false,
				error: 'Response is not an image',
				provider: 'wikipedia',
			};
		}

		// Consume body to prevent stalled response warning
		await imageResponse.arrayBuffer().catch(() => {});

		return {
			success: true,
			logoUrl: logoUrl,
			provider: 'wikipedia',
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			provider: 'wikipedia',
		};
	}
}

