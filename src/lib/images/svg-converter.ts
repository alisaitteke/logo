/**
 * SVG to PNG/WebP conversion using resvg-wasm
 * Works in Cloudflare Workers environment
 */

import { Resvg, initWasm } from '@resvg/resvg-wasm';
// @ts-ignore - WASM import
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm?module';

// Cache the WASM module
let wasmInitialized = false;

/**
 * Initialize resvg WASM module
 * This should be called once at startup
 */
async function initResvg(): Promise<void> {
	if (wasmInitialized) return;

	try {
		// Initialize WASM module for Cloudflare Workers
		await initWasm(resvgWasm);
		wasmInitialized = true;
		console.log('[SVG Converter] WASM module initialized');
	} catch (error) {
		console.error('[SVG Converter] Failed to initialize WASM:', error);
		throw error;
	}
}

/**
 * Check if data is SVG format
 */
export function isSvgData(data: ArrayBuffer): boolean {
	try {
		const bytes = new Uint8Array(data);
		const text = new TextDecoder().decode(bytes.slice(0, 200));
		return text.includes('<svg') || (text.includes('<?xml') && text.includes('svg'));
	} catch {
		return false;
	}
}

/**
 * Convert SVG to PNG
 * @param svgData - SVG data as ArrayBuffer
 * @param width - Target width (optional, maintains aspect ratio if not specified)
 * @param height - Target height (optional, maintains aspect ratio if not specified)
 * @returns PNG data as ArrayBuffer
 */
export async function convertSvgToPng(
	svgData: ArrayBuffer,
	width?: number,
	height?: number
): Promise<ArrayBuffer> {
	try {
		// Initialize WASM if needed
		if (!wasmInitialized) {
			await initResvg();
		}

		// Convert ArrayBuffer to string
		const svgString = new TextDecoder().decode(svgData);

		// Create resvg instance with options
		const opts = {
			fitTo: width && height ? {
				mode: 'width' as const,
				value: width,
			} : undefined,
		};

		const resvg = new Resvg(svgString, opts);

		// Render to PNG
		const pngData = resvg.render();
		const pngBuffer = pngData.asPng();

		console.log(`[SVG Converter] Converted SVG (${svgData.byteLength} bytes) to PNG (${pngBuffer.byteLength} bytes)`);

		return pngBuffer.buffer;
	} catch (error) {
		console.error('[SVG Converter] Conversion failed:', error);
		// Return original SVG data if conversion fails
		return svgData;
	}
}

/**
 * Convert SVG to specified format
 * @param svgData - SVG data as ArrayBuffer
 * @param format - Target format ('png', 'webp', 'svg')
 * @param width - Target width
 * @param height - Target height
 * @returns Converted image data
 */
export async function convertSvg(
	svgData: ArrayBuffer,
	format: 'png' | 'webp' | 'svg',
	width?: number,
	height?: number
): Promise<ArrayBuffer> {
	// If format is SVG, return as-is
	if (format === 'svg') {
		return svgData;
	}

	// Convert to PNG (WebP conversion would require additional library)
	// For now, we convert to PNG for both PNG and WebP requests
	return await convertSvgToPng(svgData, width, height);
}

