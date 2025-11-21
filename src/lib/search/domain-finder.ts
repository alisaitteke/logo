/**
 * Domain finder using search engines
 * Finds company website domain from company name
 */

import { DuckDuck } from 'duckduckjs';

/**
 * Find domain using DuckDuckGo Instant Answer API
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
export async function findDomainViaDuckDuckGo(companyName: string): Promise<string | null> {
	try {
		console.log(`DuckDuckGo search for: ${companyName}`);
		
		const duckduck = new DuckDuck();
		const results = await duckduck.text(companyName);

		if (!results) {
			console.log('DuckDuckGo returned no results');
			return null;
		}

		// Convert to string if it's not already
		const resultsText = typeof results === 'string' ? results : JSON.stringify(results);
		console.log('DuckDuckGo results type:', typeof results);
		console.log('DuckDuckGo results preview:', resultsText.substring(0, 500));

		// Parse results to find URLs
		const urlRegex = /https?:\/\/[^\s\)"\]]+/g;
		const urls = resultsText.match(urlRegex);

		if (!urls || urls.length === 0) {
			console.log('No URLs found in DuckDuckGo results');
			return null;
		}

		console.log(`Found ${urls.length} URLs in results`);

		// Try each URL to find a valid domain
		for (const url of urls) {
			const domain = extractDomain(url);
			// Skip wikipedia, youtube, social media, etc.
			if (domain && 
				!domain.includes('wiki') && 
				!domain.includes('youtube') &&
				!domain.includes('facebook') &&
				!domain.includes('twitter') &&
				!domain.includes('instagram') &&
				!domain.includes('linkedin')) {
				console.log(`Found domain via DuckDuckGo: ${domain}`);
				return domain;
			}
		}

		console.log('No valid domain found in DuckDuckGo results');
		return null;
	} catch (error) {
		console.error('DuckDuckGo search failed:', error);
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

