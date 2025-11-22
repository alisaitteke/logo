/**
 * Domain finder using search engines
 * Finds company website domain from company name
 */

/**
 * Find domain using DuckDuckGo Instant Answer API
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
export async function findDomainViaDuckDuckGo(companyName: string): Promise<string | null> {
	try {
		console.log(`[DomainFinder] Starting DuckDuckGo HTML search for: "${companyName}"`);
		
		// DuckDuckGo Lite HTML (simpler, works better in Workers)
		const query = encodeURIComponent(companyName);
		const url = `https://lite.duckduckgo.com/lite/?q=${query}`;

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		});

		if (!response.ok) {
			console.log(`[DomainFinder] DuckDuckGo returned ${response.status}`);
			await response.arrayBuffer().catch(() => {}); // Consume body
			return null;
		}

		const html = await response.text();
		console.log(`[DomainFinder] Got HTML response, length: ${html.length}`);

		// Extract URLs from HTML
		// DuckDuckGo Lite format: href="//duckduckgo.com/l/?uddg=ENCODED_URL"
		const hrefRegex = /href="([^"]+)"/g;
		const matches = [...html.matchAll(hrefRegex)];
		
		console.log(`[DomainFinder] Found ${matches.length} href attributes`);

		const foundDomains: string[] = [];
		
		for (const match of matches) {
			let href = match[1];
			
			// Skip internal navigation links
			if (href.startsWith('/?') || href.startsWith('#')) {
				continue;
			}

			// DuckDuckGo uses redirect URLs: //duckduckgo.com/l/?uddg=ENCODED_URL
			// We need to extract the ACTUAL destination URL, not duckduckgo.com
			if (href.includes('/l/?uddg=') || href.includes('uddg=')) {
				// Extract the actual URL from uddg parameter
				const uddgMatch = href.match(/uddg=([^&]+)/);
				if (uddgMatch) {
					const encodedUrl = uddgMatch[1];
					href = decodeURIComponent(encodedUrl);
					console.log(`[DomainFinder] Decoded URL: ${href}`);
				} else {
					// Skip if we can't decode
					continue;
				}
			} else if (href.includes('duckduckgo.com')) {
				// Skip any other duckduckgo.com links
				continue;
			}

			// Try to extract domain
			const domain = extractDomain(href);
			
			if (domain) {
				foundDomains.push(domain);
				console.log(`[DomainFinder] Found domain: ${domain}`);
				
				// Skip filtered domains
				const isFiltered = domain.includes('wiki') || 
					domain.includes('youtube') ||
					domain.includes('facebook') ||
					domain.includes('twitter') ||
					domain.includes('instagram') ||
					domain.includes('linkedin');
				
				if (!isFiltered) {
					console.log(`[DomainFinder] ✓ VALID domain: ${domain}`);
					return domain;
				} else {
					console.log(`[DomainFinder] ✗ Filtered: ${domain}`);
				}
			}
		}

		console.log(`[DomainFinder] Total: ${foundDomains.length} domains, all filtered`);

		console.log('[DomainFinder] No valid domain found in results');
		return null;
	} catch (error) {
		console.error('[DomainFinder] DuckDuckGo FAILED:', error);
		return null;
	}
}

/**
 * Find domain using Google search (scraping first result)
 * Note: This is a fallback and may be rate-limited
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
export async function findDomainViaGoogle(companyName: string): Promise<string | null> {
	try {
		// Google search with site: operator to find official website
		const query = encodeURIComponent(`${companyName} official website`);
		const url = `https://www.google.com/search?q=${query}`;

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			},
		});

		if (!response.ok) {
			return null;
		}

		const html = await response.text();

		// Extract first URL from search results
		// Look for patterns like: href="/url?q=https://example.com
		const urlMatch = html.match(/href="\/url\?q=(https?:\/\/[^&"]+)/);
		if (urlMatch && urlMatch[1]) {
			const domain = extractDomain(decodeURIComponent(urlMatch[1]));
			if (domain) return domain;
		}

		return null;
	} catch (error) {
		console.error('Google search failed:', error);
		return null;
	}
}

/**
 * Extract clean domain from URL
 * @param url - Full URL
 * @returns Clean domain (e.g., "example.com")
 */
function extractDomain(url: string): string | null {
	try {
		const urlObj = new URL(url);
		let domain = urlObj.hostname;

		// Remove www. prefix
		domain = domain.replace(/^www\./, '');

		// Validate domain format
		if (domain && domain.includes('.')) {
			return domain;
		}

		return null;
	} catch (error) {
		return null;
	}
}

/**
 * Find domain using Wikipedia API
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
export async function findDomainViaWikipedia(companyName: string): Promise<string | null> {
	try {
		// Wikipedia OpenSearch API
		const query = encodeURIComponent(companyName);
		const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${query}&limit=1&format=json`;

		const searchResponse = await fetch(searchUrl);
		if (!searchResponse.ok) return null;

		const searchData = await searchResponse.json();
		
		// searchData format: [query, [titles], [descriptions], [urls]]
		if (!searchData[3] || searchData[3].length === 0) return null;

		const pageUrl = searchData[3][0];
		const pageTitle = searchData[1][0];

		// Get page content to extract official website
		const pageQuery = encodeURIComponent(pageTitle);
		const pageUrl2 = `https://en.wikipedia.org/w/api.php?action=query&titles=${pageQuery}&prop=extlinks&format=json`;

		const pageResponse = await fetch(pageUrl2);
		if (!pageResponse.ok) return null;

		const pageData = await pageResponse.json();
		const pages = pageData.query?.pages;
		
		if (!pages) return null;

		// Get first page
		const pageId = Object.keys(pages)[0];
		const page = pages[pageId];
		const extlinks = page.extlinks || [];

		// Look for official website (usually first external link)
		for (const link of extlinks) {
			const url = link['*'];
			if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
				const domain = extractDomain(url);
				// Skip wikipedia, wikimedia, etc.
				if (domain && !domain.includes('wiki')) {
					return domain;
				}
			}
		}

		return null;
	} catch (error) {
		console.error('Wikipedia search failed:', error);
		return null;
	}
}

/**
 * Find domain from company name using multiple search engines
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
export async function findDomainFromCompanyName(companyName: string): Promise<string | null> {
	// Try Wikipedia first (reliable and free)
	let domain = await findDomainViaWikipedia(companyName);
	if (domain) {
		console.log(`Found domain via Wikipedia: ${domain}`);
		return domain;
	}

	// Try DuckDuckGo (has free API but often returns empty)
	domain = await findDomainViaDuckDuckGo(companyName);
	if (domain) {
		console.log(`Found domain via DuckDuckGo: ${domain}`);
		return domain;
	}

	// Try Google as last resort (may be rate-limited)
	domain = await findDomainViaGoogle(companyName);
	if (domain) {
		console.log(`Found domain via Google: ${domain}`);
		return domain;
	}

	return null;
}

