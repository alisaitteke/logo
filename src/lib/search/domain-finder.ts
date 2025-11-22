/**
 * Domain finder using search engines
 * Finds company website domain from company name
 */

/**
 * Find domain using DuckDuckGo Instant Answer API
 * Note: DuckDuckGo Lite uses JavaScript, so we use Instant Answer API instead
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
export async function findDomainViaDuckDuckGo(companyName: string): Promise<string | null> {
	try {
		console.log(`[DomainFinder] Starting DuckDuckGo Instant Answer API search for: "${companyName}"`);
		
		// DuckDuckGo Instant Answer API (no JavaScript required)
		const query = encodeURIComponent(companyName);
		const apiUrl = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;

		const apiResponse = await fetch(apiUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		});

		if (!apiResponse.ok) {
			console.log(`[DomainFinder] DuckDuckGo API returned ${apiResponse.status}`);
			// Fallback to HTML search if API fails
			return await findDomainViaDuckDuckGoHtml(companyName);
		}

		const data = await apiResponse.json();
		
		// Check for AbstractURL (official website)
		if (data.AbstractURL) {
			const domain = extractDomain(data.AbstractURL);
			// Skip Wikipedia and DuckDuckGo domains
			if (domain && !domain.includes('duckduckgo.com') && !domain.includes('wikipedia.org') && !domain.includes('wiki')) {
				console.log(`[DomainFinder] Found domain via AbstractURL: ${domain}`);
				return domain;
			} else if (domain && (domain.includes('wikipedia.org') || domain.includes('wiki'))) {
				console.log(`[DomainFinder] ✗ Skipping Wikipedia domain: ${domain}`);
			}
		}
		
		// Check for Results (search results)
		if (data.Results && data.Results.length > 0) {
			for (const result of data.Results) {
				if (result.FirstURL) {
					const domain = extractDomain(result.FirstURL);
					// Skip Wikipedia and DuckDuckGo domains
					if (domain && !domain.includes('duckduckgo.com') && !domain.includes('wikipedia.org') && !domain.includes('wiki')) {
						console.log(`[DomainFinder] Found domain via Results: ${domain}`);
						return domain;
					}
				}
			}
		}
		
		// Check for RelatedTopics
		if (data.RelatedTopics && data.RelatedTopics.length > 0) {
			for (const topic of data.RelatedTopics) {
				if (topic.FirstURL) {
					const domain = extractDomain(topic.FirstURL);
					// Skip Wikipedia and DuckDuckGo domains
					if (domain && !domain.includes('duckduckgo.com') && !domain.includes('wikipedia.org') && !domain.includes('wiki')) {
						console.log(`[DomainFinder] Found domain via RelatedTopics: ${domain}`);
						return domain;
					}
				}
			}
		}

		console.log('[DomainFinder] No valid domain found in DuckDuckGo API results, falling back to HTML search');
		return await findDomainViaDuckDuckGoHtml(companyName);
	} catch (error) {
		console.error('[DomainFinder] DuckDuckGo API FAILED:', error);
		return null;
	}
}

/**
 * Find domain using DuckDuckGo HTML search (Lite version)
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
async function findDomainViaDuckDuckGoHtml(companyName: string): Promise<string | null> {
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
			console.log(`[DomainFinder] DuckDuckGo HTML returned ${response.status}`);
			await response.arrayBuffer().catch(() => {}); // Consume body
			return null;
		}

		const html = await response.text();
		console.log(`[DomainFinder] Got HTML response, length: ${html.length}`);

		// Extract URLs from HTML
		// DuckDuckGo Lite format for result links: `<a href="//duckduckgo.com/l/?uddg=..." ...>` or `<a href="/l/?uddg=..." ...>`
		// Match both relative and protocol-relative URLs
		const hrefRegex = /<a[^>]+href=["']([^"']*\/l\/\?uddg=[^"']+)["'][^>]*>/gi;
		const matches = [...html.matchAll(hrefRegex)];
		
		console.log(`[DomainFinder] Found ${matches.length} href attributes`);

		const foundDomains: string[] = [];
		
		for (const match of matches) {
			let href = match[1];
			console.log(`[DomainFinder] Processing href: ${href}`);
			
			// Skip internal navigation links
			if (href.startsWith('/?') || href.startsWith('#')) {
				console.log(`[DomainFinder] ✗ Skipping internal link: ${href}`);
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
					
					// Skip if decoded URL is an ad link (contains y.js)
					if (href.includes('y.js') || href.includes('/y.js')) {
						console.log(`[DomainFinder] ✗ Skipping ad link: ${href}`);
						continue;
					}
					
					// Skip if decoded URL still contains duckduckgo.com
					if (href.includes('duckduckgo.com')) {
						console.log(`[DomainFinder] ✗ Skipping decoded DuckDuckGo URL: ${href}`);
						continue;
					}
				} else {
					// Skip if we can't decode
					console.log(`[DomainFinder] ✗ Could not decode uddg parameter: ${href}`);
					continue;
				}
			} else if (href.includes('duckduckgo.com')) {
				// Skip any other duckduckgo.com links
				console.log(`[DomainFinder] ✗ Skipping DuckDuckGo link: ${href}`);
				continue;
			}

			// Try to extract domain
			const domain = extractDomain(href);
			
			if (domain) {
				foundDomains.push(domain);
				console.log(`[DomainFinder] Found domain: ${domain} from href: ${href}`);
				
				// Skip DuckDuckGo domain (should never be returned)
				if (domain.includes('duckduckgo.com') || domain === 'duckduckgo.com') {
					console.log(`[DomainFinder] ✗ Skipping DuckDuckGo domain: ${domain}`);
					continue;
				}
				
				// Skip filtered domains
				const isFiltered = domain.includes('wikipedia.org') ||
					domain.includes('wiki') || 
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
			} else {
				console.log(`[DomainFinder] ✗ Could not extract domain from href: ${href}`);
			}
		}

		console.log(`[DomainFinder] Total: ${foundDomains.length} domains, all filtered`);

		console.log('[DomainFinder] No valid domain found in DuckDuckGo HTML results');
		return null;
	} catch (error) {
		console.error('[DomainFinder] DuckDuckGo HTML FAILED:', error);
		return null;
	}
}

/**
 * Check if domain should be filtered out
 * @param domain - Domain to check
 * @returns true if domain should be skipped
 */
function shouldFilterDomain(domain: string): boolean {
	const domainLower = domain.toLowerCase();
	
	// Filter government domains (.gov, .gov.tr, .gov.uk, etc.)
	if (domainLower.includes('.gov') || domainLower.endsWith('.gov')) {
		return true;
	}
	
	// Filter other unwanted domains
	const unwantedPatterns = [
		'duckduckgo.com',
		'wikipedia.org',
		'wiki',
		'youtube',
		'facebook',
		'twitter',
		'instagram',
		'linkedin',
	];
	
	return unwantedPatterns.some(pattern => domainLower.includes(pattern));
}

/**
 * Extract clean domain from URL
 * @param url - Full URL
 * @returns Clean domain (e.g., "example.com") or null if filtered
 */
function extractDomain(url: string): string | null {
	try {
		// Handle protocol-relative URLs (//example.com)
		if (url.startsWith('//')) {
			url = 'https:' + url;
		}
		
		// Handle URLs without protocol
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			// If it looks like a domain (contains . but no /), add https://
			if (url.includes('.') && !url.includes('/')) {
				url = 'https://' + url;
			} else if (url.includes('://')) {
				// Already has protocol but not http/https
				return null; // Don't attempt to fix unknown protocols
			} else {
				// If it doesn't look like a full URL or a relative path, assume it's a domain and prepend https://
				url = 'https://' + url;
			}
		}
		
		const urlObj = new URL(url);
		let domain = urlObj.hostname;

		// Remove www. prefix - Temporarily disabled to preserve www from search results
		// domain = domain.replace(/^www\./, '');

		// Validate domain format (must contain at least one dot)
		if (!domain || !domain.includes('.')) {
			return null;
		}
		
		// Filter unwanted domains (gov, wikipedia, social media, etc.)
		if (shouldFilterDomain(domain)) {
			console.log(`[DomainFinder] ✗ Filtered domain: ${domain}`);
			return null;
		}

		return domain;
	} catch (error) {
		// If URL parsing fails, try to extract domain manually
		// Look for patterns like "example.com" or "www.example.com"
		const domainMatch = url.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/);
		if (domainMatch && domainMatch[1]) {
			const domain = domainMatch[1].replace(/^www\./, '');
			if (domain.includes('.') && !shouldFilterDomain(domain)) {
				return domain;
			}
		}
		return null;
	}
}

/**
 * Find domain from company name using multiple search engines
 * @param companyName - Company name to search
 * @returns Domain or null if not found
 */
export async function findDomainFromCompanyName(companyName: string): Promise<string | null> {
	// Try DuckDuckGo first (free API, no JavaScript required)
	let domain = await findDomainViaDuckDuckGo(companyName);
	if (domain) {
		console.log(`Found domain via DuckDuckGo: ${domain}`);
		return domain;
	}

	return null;
}

