/**
 * Wikimedia Commons provider
 * Fetches logos from Wikimedia Commons using their API
 * Documentation: https://www.mediawiki.org/wiki/API:Main_page
 */

import type { LogoProviderOptions, LogoProviderResult } from './getlogo';

/**
 * Convert non-Latin characters to Latin equivalents
 * Handles Turkish, Greek, Cyrillic, and other common alphabets
 */
function latinize(text: string): string {
	const charMap: Record<string, string> = {
		// Turkish
		'ç': 'c', 'Ç': 'C',
		'ğ': 'g', 'Ğ': 'G',
		'ı': 'i', 'İ': 'I',
		'ö': 'o', 'Ö': 'O',
		'ş': 's', 'Ş': 'S',
		'ü': 'u', 'Ü': 'U',
		// German
		'ä': 'a', 'Ä': 'A',
		'ß': 'ss',
		// French
		'à': 'a', 'â': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
		'î': 'i', 'ï': 'i', 'ô': 'o', 'ù': 'u', 'û': 'u', 'ÿ': 'y',
		'À': 'A', 'Â': 'A', 'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
		'Î': 'I', 'Ï': 'I', 'Ô': 'O', 'Ù': 'U', 'Û': 'U', 'Ÿ': 'Y',
		// Spanish
		'á': 'a', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n',
		'Á': 'A', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N',
		// Portuguese
		'ã': 'a', 'õ': 'o',
		'Ã': 'A', 'Õ': 'O',
		// Nordic
		'å': 'a', 'Å': 'A', 'æ': 'ae', 'Æ': 'AE', 'ø': 'o', 'Ø': 'O',
		// Polish
		'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ś': 's', 'ź': 'z', 'ż': 'z',
		'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
	};

	return text.split('').map(char => charMap[char] || char).join('');
}

/**
 * Search for logo files in Wikimedia Commons
 * @param searchTerm - Company name or domain to search for
 * @returns Array of file names found
 */
async function searchCommonsForLogo(searchTerm: string): Promise<string[]> {
	try {
		// Clean search term: remove common TLDs, www, etc.
		let cleanTerm = searchTerm
			.replace(/^www\./, '')
			.replace(/\.(com|org|net|co\.uk|io|dev)$/i, '')
			.trim();

		// IMPORTANT: Latinize FIRST, then lowercase
		// This handles Turkish İ/I correctly: İşbank → Isbank → isbank
		const latinizedTerm = latinize(cleanTerm);
		const latinTerm = latinizedTerm.toLowerCase();
		const originalLower = cleanTerm.toLowerCase();
		const hasNonLatin = latinTerm !== originalLower;
		
		// Use original lowercased term as primary
		cleanTerm = originalLower;

		// Build search queries - try multiple variations
		const searchQueries = [
			`${cleanTerm} logo`,
			`${cleanTerm} logotype`,
			`${cleanTerm} brand`,
			`File:${cleanTerm} logo`,
			`File:${cleanTerm} logotype`,
		];

		// Add latinized versions if different
		if (hasNonLatin) {
			console.log(`[Wikimedia] Adding latinized search: "${cleanTerm}" → "${latinTerm}"`);
			searchQueries.push(
				`${latinTerm} logo`,
				`${latinTerm} logotype`,
				`File:${latinTerm} logo`,
			);
		}

		const foundFiles: string[] = [];

		for (const query of searchQueries) {
			const apiUrl = `https://commons.wikimedia.org/w/api.php?` +
				`action=query&` +
				`list=search&` +
				`srsearch=${encodeURIComponent(query)}&` +
				`srnamespace=6&` + // File namespace
				`srlimit=10&` +
				`format=json&` +
				`origin=*`;

			const response = await fetch(apiUrl, {
				headers: {
					'User-Agent': 'LogoCDN/1.0 (https://github.com/your-repo)',
				},
			});

			if (!response.ok) {
				console.log(`[Wikimedia] Search API returned ${response.status} for query: ${query}`);
				continue;
			}

			const data = await response.json();

			if (data.query && data.query.search) {
				for (const result of data.query.search) {
					const title = result.title;
					// Extract file name (remove "File:" prefix if present)
					const fileName = title.replace(/^File:/, '');
					const fileNameLower = fileName.toLowerCase();
					
					// Filter for logo-related files
					if (
						fileNameLower.includes('logo') ||
						fileNameLower.includes('logotype') ||
						fileNameLower.includes('brand')
					) {
						// Check if filename contains the search term (for better matching)
						const containsSearchTerm = fileNameLower.includes(cleanTerm.toLowerCase());
						
						// Prefer exact matches, then SVG, then PNG
						if (fileNameLower.endsWith('.svg')) {
							if (containsSearchTerm) {
								foundFiles.unshift(fileName); // Exact match SVG to front
							} else {
								foundFiles.push(fileName); // Non-exact SVG to back
							}
						} else if (
							fileNameLower.endsWith('.png') ||
							fileNameLower.endsWith('.jpg') ||
							fileNameLower.endsWith('.jpeg')
						) {
							if (containsSearchTerm) {
								// Exact match raster before non-exact SVG
								const firstNonExactIndex = foundFiles.findIndex(f => 
									!f.toLowerCase().includes(cleanTerm.toLowerCase())
								);
								if (firstNonExactIndex !== -1) {
									foundFiles.splice(firstNonExactIndex, 0, fileName);
								} else {
									foundFiles.push(fileName);
								}
							} else {
								foundFiles.push(fileName);
							}
						}
					}
				}
			}

			// If we found results, break early
			if (foundFiles.length > 0) {
				break;
			}
		}

		// Remove duplicates
		return [...new Set(foundFiles)];
	} catch (error) {
		console.error('[Wikimedia] Search failed:', error);
		return [];
	}
}

/**
 * Get image URL from Wikimedia Commons file name
 * @param fileName - File name (e.g., "Company_logo.svg")
 * @returns Direct URL to the image file
 */
async function getCommonsImageUrl(fileName: string): Promise<string | null> {
	try {
		// Ensure "File:" prefix
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
			console.log(`[Wikimedia] Image info API returned ${response.status} for file: ${fileName}`);
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
		console.error(`[Wikimedia] Failed to get image URL for ${fileName}:`, error);
		return null;
	}
}

/**
 * Fetch logo from Wikimedia Commons
 * @param options - Logo fetch options
 * @returns Logo URL or error
 */
export async function fetchLogoFromWikimedia(
	options: LogoProviderOptions
): Promise<LogoProviderResult> {
	const { domain, companyName } = options;

	try {
		// Determine search term
		let searchTerm = companyName || domain || '';
		
		if (!searchTerm) {
			return {
				success: false,
				error: 'Either domain or companyName must be provided',
				provider: 'wikimedia',
			};
		}

		// If we have a domain, extract company name from it
		if (domain && !companyName) {
			searchTerm = domain.replace(/^www\./, '').split('.')[0];
		}

		// Only search Wikimedia for single-word company names (more specific, less false positives)
		const words = searchTerm.trim().split(/\s+/);
		
		if (words.length > 1) {
			console.log(`[Wikimedia] Skipping multi-word search term: "${searchTerm}" (${words.length} words)`);
			return {
				success: false,
				error: 'Wikimedia search only for single-word company names',
				provider: 'wikimedia',
			};
		}

		console.log(`[Wikimedia] Searching Commons for single-word term: "${searchTerm}"`);

		// Search for logo files
		const foundFiles = await searchCommonsForLogo(searchTerm);

		if (foundFiles.length === 0) {
			return {
				success: false,
				error: 'No logo found in Wikimedia Commons',
				provider: 'wikimedia',
			};
		}

		console.log(`[Wikimedia] Found ${foundFiles.length} potential logo(s), trying first: ${foundFiles[0]}`);

		// Try to get URL for the first (best) match
		const imageUrl = await getCommonsImageUrl(foundFiles[0]);

		if (!imageUrl) {
			return {
				success: false,
				error: 'Could not retrieve image URL from Wikimedia Commons',
				provider: 'wikimedia',
			};
		}

		// Verify the image exists and is accessible
		const imageResponse = await fetch(imageUrl, {
			headers: {
				'User-Agent': 'LogoCDN/1.0',
			},
		});

		if (!imageResponse.ok) {
			return {
				success: false,
				error: `Image not accessible: HTTP ${imageResponse.status}`,
				provider: 'wikimedia',
			};
		}

		const contentType = imageResponse.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			await imageResponse.arrayBuffer().catch(() => {});
			return {
				success: false,
				error: 'Response is not an image',
				provider: 'wikimedia',
			};
		}

		// Consume body to prevent stalled response warning
		await imageResponse.arrayBuffer().catch(() => {});

		return {
			success: true,
			logoUrl: imageUrl,
			provider: 'wikimedia',
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			provider: 'wikimedia',
		};
	}
}

