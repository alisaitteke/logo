/**
 * Image transformation utilities using Photon (WebAssembly)
 */

import { PhotonImage, resize, grayscale } from '@cf-wasm/photon';

export interface TransformOptions {
	width?: number;
	height?: number;
	format?: 'png' | 'webp' | 'jpeg';
	greyscale?: boolean;
	quality?: number;
}

/**
 * Transform image using Photon (WebAssembly)
 * @param imageData - Original image data (PNG/JPEG/WebP)
 * @param options - Transformation options
 * @returns Transformed image data
 */
export async function transformImage(
	imageData: ArrayBuffer,
	options: TransformOptions
): Promise<ArrayBuffer> {
	try {
		// Load image into Photon
		const inputImage = PhotonImage.new_from_byteslice(new Uint8Array(imageData));
		
		let outputImage = inputImage;

		// Resize if width/height specified
		if (options.width && options.height) {
			outputImage = resize(
				outputImage,
				options.width,
				options.height,
				1 // SamplingFilter: Nearest = 1, Triangle = 2, CatmullRom = 3, Gaussian = 4, Lanczos3 = 5
			);
		}

		// Apply greyscale if requested
		if (options.greyscale) {
			grayscale(outputImage);
		}

		// Get output bytes
		const outputBytes = outputImage.get_bytes();
		
		// Free memory
		inputImage.free();
		if (outputImage !== inputImage) {
			outputImage.free();
		}

		return outputBytes.buffer;
	} catch (error) {
		console.error('Image transformation failed:', error);
		// Return original image if transformation fails
		return imageData;
	}
}

/**
 * Check if transformation is needed
 */
export function needsTransformation(options: TransformOptions): boolean {
	return !!(
		options.width ||
		options.height ||
		options.greyscale
	);
}

/**
 * Standard logo size presets
 */
export const LOGO_SIZES = {
	FAVICON: 64,
	THUMBNAIL: 128,
	STANDARD: 256,
	LARGE: 512,
} as const;

/**
 * Get the closest standard size
 */
export function getStandardSize(requestedSize?: number): number {
	if (!requestedSize) return LOGO_SIZES.STANDARD;
	
	const sizes = Object.values(LOGO_SIZES);
	return sizes.reduce((prev, curr) => 
		Math.abs(curr - requestedSize) < Math.abs(prev - requestedSize) ? curr : prev
	);
}
