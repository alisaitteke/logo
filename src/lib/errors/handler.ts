/**
 * Centralized error handling utilities
 * Provides consistent error responses across all endpoints
 */

import { createCorsResponse } from '../middleware/cors';

export enum ErrorCode {
	// Client errors (4xx)
	BAD_REQUEST = 'BAD_REQUEST',
	UNAUTHORIZED = 'UNAUTHORIZED',
	FORBIDDEN = 'FORBIDDEN',
	NOT_FOUND = 'NOT_FOUND',
	RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	
	// Server errors (5xx)
	INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
	SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface ErrorResponse {
	error: string;
	code: ErrorCode;
	message: string;
	statusCode: number;
	details?: Record<string, any>;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
	error: string,
	code: ErrorCode,
	statusCode: number,
	details?: Record<string, any>
): ErrorResponse {
	return {
		error,
		code,
		message: error,
		statusCode,
		...(details && { details }),
	};
}

/**
 * Map error types to HTTP status codes and error codes
 */
export function mapErrorToResponse(error: unknown): {
	statusCode: number;
	errorCode: ErrorCode;
	message: string;
} {
	// If it's already a known error response
	if (error && typeof error === 'object' && 'statusCode' in error && 'code' in error) {
		return {
			statusCode: (error as ErrorResponse).statusCode,
			errorCode: (error as ErrorResponse).code,
			message: (error as ErrorResponse).message,
		};
	}

	// If it's an Error instance
	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		// Validation errors
		if (message.includes('invalid') || message.includes('validation') || message.includes('format')) {
			return {
				statusCode: 400,
				errorCode: ErrorCode.VALIDATION_ERROR,
				message: error.message,
			};
		}

		// Not found errors
		if (message.includes('not found') || message.includes('failed to fetch')) {
			return {
				statusCode: 404,
				errorCode: ErrorCode.NOT_FOUND,
				message: error.message,
			};
		}

		// Unauthorized errors
		if (message.includes('unauthorized') || message.includes('invalid api key') || message.includes('authentication')) {
			return {
				statusCode: 401,
				errorCode: ErrorCode.UNAUTHORIZED,
				message: error.message,
			};
		}

		// Rate limit errors
		if (message.includes('rate limit')) {
			return {
				statusCode: 429,
				errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
				message: error.message,
			};
		}
	}

	// Default to internal server error
	return {
		statusCode: 500,
		errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
		message: 'Internal server error',
	};
}

/**
 * Create HTTP response from error
 */
export function createErrorHttpResponse(
	error: unknown,
	request: Request,
	details?: Record<string, any>
): Response {
	const { statusCode, errorCode, message } = mapErrorToResponse(error);

	const errorResponse = createErrorResponse(message, errorCode, statusCode, details);

	// Log error for monitoring (in production, use proper logging service)
	if (statusCode >= 500) {
		console.error('Server error:', {
			error: error instanceof Error ? error.stack : String(error),
			code: errorCode,
			statusCode,
			details,
		});
	} else {
		console.warn('Client error:', {
			error: error instanceof Error ? error.message : String(error),
			code: errorCode,
			statusCode,
			details,
		});
	}

	return createCorsResponse(
		JSON.stringify(errorResponse),
		{
			status: statusCode,
			headers: { 'Content-Type': 'application/json' },
		},
		request
	);
}

/**
 * Common error responses
 */
export const CommonErrors = {
	badRequest: (message: string, details?: Record<string, any>) =>
		createErrorResponse(message, ErrorCode.BAD_REQUEST, 400, details),
	
	unauthorized: (message: string = 'Unauthorized') =>
		createErrorResponse(message, ErrorCode.UNAUTHORIZED, 401),
	
	forbidden: (message: string = 'Forbidden') =>
		createErrorResponse(message, ErrorCode.FORBIDDEN, 403),
	
	notFound: (message: string = 'Resource not found') =>
		createErrorResponse(message, ErrorCode.NOT_FOUND, 404),
	
	rateLimitExceeded: (message: string = 'Rate limit exceeded', retryAfter?: number) =>
		createErrorResponse(
			message,
			ErrorCode.RATE_LIMIT_EXCEEDED,
			429,
			retryAfter ? { retryAfter } : undefined
		),
	
	validationError: (message: string, details?: Record<string, any>) =>
		createErrorResponse(message, ErrorCode.VALIDATION_ERROR, 400, details),
	
	internalServerError: (message: string = 'Internal server error') =>
		createErrorResponse(message, ErrorCode.INTERNAL_SERVER_ERROR, 500),
	
	serviceUnavailable: (message: string = 'Service temporarily unavailable') =>
		createErrorResponse(message, ErrorCode.SERVICE_UNAVAILABLE, 503),
};

/**
 * Wrap async handler with error handling
 */
export function withErrorHandling(
	handler: (context: any, ...args: any[]) => Promise<Response>,
	request: Request
) {
	return async (context: any, ...args: any[]): Promise<Response> => {
		try {
			return await handler(context, ...args);
		} catch (error) {
			return createErrorHttpResponse(error, request);
		}
	};
}

