/**
 * Google Favicon Service provider
 * Fetches favicons from Google's favicon service
 */

export interface GoogleFaviconOptions {
	domain: string;
	size?: number;
}

/**
 * Extract favicon URL from HTML meta tags
 * @param html - HTML content
 * @param baseUrl - Base URL for resolving relative paths
 * @returns Favicon URL or null
 */
function extractFaviconFromHTML(html: string, baseUrl: string): string[] {
	const foundFavicons: { url: string; size?: number; type?: string }[] = [];

	// Regex to find all link tags related to favicons
	// Catches <link rel="icon" href="..." sizes="..."> or <link href="..." rel="icon" sizes="...">
	const linkRegex = /<link\s+(?:[^>]*?\s+)?(?:rel=["'](?:icon|shortcut\s+icon|apple-touch-icon)[^>]*?|href=["'](?!data:)([^"']+)["'][^>]*?)(?:sizes=["'](\d+x\d+)["'])?[^>]*?(?:type=["']([^"']+)["'])?[^>]*?\s+href=["'](?!data:)([^"']+)["'][^>]*>/gi;
	const metaRegex = /<meta\s+(?:[^>]*?\s+)?property=["']og:image["'][^>]*?\s+content=["']([^"']+)["'][^>]*>/gi; // Open Graph image
	
	let match;

	// Process link tags
	while ((match = linkRegex.exec(html)) !== null) {
		const sizesAttr = match[2]; // Capture group for sizes
		const typeAttr = match[3];  // Capture group for type
		let faviconUrl = match[4].trim(); // Capture group for href

		let size = sizesAttr ? parseInt(sizesAttr.split('x')[0], 10) : undefined;
		const type = typeAttr || (faviconUrl.endsWith('.svg') ? 'image/svg+xml' : undefined);

		// Resolve relative URLs
		faviconUrl = (new URL(faviconUrl, baseUrl)).href;
		
		foundFavicons.push({ url: faviconUrl, size, type });
	}

	// Process Open Graph meta tags for images
	while ((match = metaRegex.exec(html)) !== null) {
		let imageUrl = match[1].trim();
		imageUrl = (new URL(imageUrl, baseUrl)).href;

		// Assume Open Graph images are usually larger and high quality
		foundFavicons.push({ url: imageUrl, size: 512, type: 'image/png' }); // Set a decent default size
	}

	// Sort favicons by preference:
	// 1. SVG
	// 2. PNG/SVG with largest size
	// 3. Other image formats with largest size
	foundFavicons.sort((a, b) => {
		// Prioritize SVG over others unless PNG is significantly larger
		if (a.type === 'image/svg+xml' && b.type !== 'image/svg+xml') return -1;
		if (b.type === 'image/svg+xml' && a.type !== 'image/svg+xml') return 1;

		// If both are PNG or other rastor formats, sort by size
		if (a.size && b.size) return b.size - a.size; // Largest first
		
		// Fallback to alphabetical if sizes are not available
		return 0;
	});

	return foundFavicons.map(f => f.url);
}

/**
 * Fetch favicon from Google's service
 * @param options - Fetch options
 * @returns Logo data or null if not found
 */
export async function fetchLogoFromGoogleFavicon(
	options: GoogleFaviconOptions
): Promise<{ success: boolean; logoData?: ArrayBuffer; error?: string }> {
	const { domain, size = 256 } = options; // domain'i burada tanımla

	try {
		// Reject DuckDuckGo domain (should never fetch DuckDuckGo logo)
		if (domain.includes('duckduckgo.com') || domain === 'duckduckgo.com') {
			return {
				success: false,
				error: 'Invalid domain: duckduckgo.com',
			};
		}

		const protocol = domain.startsWith('localhost') ? 'http' : 'https';
		const domainBaseUrl = `${protocol}://${domain}`;

		// Try Google Favicon API first
		// https://www.google.com/s2/favicons?domain=example.com&sz=256
		let url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;

		let response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
			},
		});

		// If Google Favicon fails, try to get favicon from domain's HTML
		if (!response.ok || response.status === 404) {
			console.log(`[GoogleFavicon] Google API failed (${response.status}), trying to fetch from domain HTML`);
			
			try {
				// Fetch the homepage HTML
				const htmlResponse = await fetch(domainBaseUrl, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.5',
					},
				});
				
				if (htmlResponse.ok) {
					const html = await htmlResponse.text();
					const faviconUrls = extractFaviconFromHTML(html, domainBaseUrl);
					
					if (faviconUrls.length > 0) {
						for (const faviconUrl of faviconUrls) {
							console.log(`[GoogleFavicon] Attempting to fetch meta favicon: ${faviconUrl}`);
							try {
								response = await fetch(faviconUrl, {
									headers: {
										'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
										'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
									},
								});
								
								if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
									console.log(`[GoogleFavicon] Successfully fetched meta favicon: ${faviconUrl}`);
									// Found a valid image, break loop
									break;
								} else {
									console.log(`[GoogleFavicon] Meta favicon '${faviconUrl}' failed (${response.status || 'N/A'} or not image), trying next.`);
								}
							} catch (fetchError) {
								console.log(`[GoogleFavicon] Error fetching meta favicon '${faviconUrl}': ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
							}
						}

						// If loop completed and no valid image was found, fall back to /favicon.ico
						if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
							console.log(`[GoogleFavicon] No valid meta favicon found after all attempts, trying ${domainBaseUrl}/favicon.ico`);
							response = await fetch(`${domainBaseUrl}/favicon.ico`, {
								headers: {
									'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
									'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
								},
							});
						}
					} else {
						// No favicon in meta, try /favicon.ico directly
						console.log(`[GoogleFavicon] No favicon URLs found in HTML meta, trying ${domainBaseUrl}/favicon.ico`);
						response = await fetch(`${domainBaseUrl}/favicon.ico`, {
							headers: {
								'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
								'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
							},
						});
					}
				} else {
					// HTML fetch failed, try /favicon.ico directly
					console.log(`[GoogleFavicon] HTML fetch failed for ${domainBaseUrl} (${htmlResponse.status}), trying ${domainBaseUrl}/favicon.ico`);
					response = await fetch(`${domainBaseUrl}/favicon.ico`, {
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
							'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
						},
					});
				}
			} catch (htmlError) {
				// HTML fetch error, try /favicon.ico directly
				console.log(`[GoogleFavicon] Error fetching HTML for ${domainBaseUrl}: ${htmlError instanceof Error ? htmlError.message : String(htmlError)}, trying ${domainBaseUrl}/favicon.ico`);
				response = await fetch(`${domainBaseUrl}/favicon.ico`, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
						'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
					},
				});
			}
			
			if (!response.ok) {
				return {
					success: false,
					error: `Google Favicon and direct /favicon.ico failed for ${domain}. Final status: ${response.status || 'N/A'}`,
				};
			}
		}

		const contentType = response.headers.get('content-type');
		if (!contentType || !contentType.startsWith('image/')) {
			return {
				success: false,
				error: `Invalid content type (${contentType || 'N/A'}) from ${response.url}. Expected image.`,
			};
		}

		const logoData = await response.arrayBuffer();

		// Check if it's a valid image (not empty)
		if (logoData.byteLength === 0) {
			console.log(`[GoogleFavicon] Fetched image from ${response.url} is empty.`);
			return {
				success: false,
				error: 'Image is empty',
			};
		}

		return {
			success: true,
			logoData,
		};
	} catch (error) {
		console.error(`[GoogleFavicon] Unexpected error for ${domain}:`, error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

