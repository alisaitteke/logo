/**
 * Custom Cloudflare Worker Entry Point
 * This file replaces Astro's default worker entry point
 * to add queue consumer support
 */

import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import type { EmailMessage } from './lib/email/queue';

interface Env {
	// Brevo API key
	BREVO_API_KEY?: string;
	// From email address (must be verified in Brevo)
	BREVO_FROM_EMAIL?: string;
	// From name (optional)
	BREVO_FROM_NAME?: string;
}

/**
 * Send email using Brevo API
 * Brevo API docs: https://developers.brevo.com/reference/sendtransacemail
 */
async function sendEmail(message: EmailMessage, env: Env): Promise<boolean> {
	try {
		if (!env.BREVO_API_KEY) {
			console.warn('BREVO_API_KEY not configured. Email would be sent:', {
				to: message.to,
				subject: message.subject,
			});
			return true; // Return true in dev mode to allow testing
		}

		const fromEmail = env.BREVO_FROM_EMAIL || 'logo@alisait.com';
		const fromName = env.BREVO_FROM_NAME || 'Logo CDN';

		// Brevo API endpoint
		const response = await fetch('https://api.brevo.com/v3/smtp/email', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'api-key': env.BREVO_API_KEY,
			},
			body: JSON.stringify({
				sender: {
					name: fromName,
					email: fromEmail,
				},
				to: [
					{
						email: message.to,
					},
				],
				subject: message.subject,
				htmlContent: message.html,
				textContent: message.text,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Brevo API error:', response.status, errorText);
			return false;
		}

		const data = await response.json();
		console.log('Email sent successfully via Brevo:', data);
		return true;
	} catch (error) {
		console.error('Failed to send email via Brevo:', error);
		return false;
	}
}

/**
 * Queue consumer handler for email queue
 */
async function handleQueue(batch: MessageBatch<EmailMessage>, env: Env): Promise<void> {
	for (const message of batch.messages) {
		try {
			const emailMessage = message.body;
			const success = await sendEmail(emailMessage, env);

			if (success) {
				message.ack();
			} else {
				// Retry on failure
				message.retry();
			}
		} catch (error) {
			console.error('Error processing email message:', error);
			// Retry on error
			message.retry();
		}
	}
}

/**
 * Create exports with both fetch and queue handlers
 */
export function createExports(manifest: SSRManifest) {
	const app = new App(manifest);

	return {
		default: {
			async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
				return handle(manifest, app, request, env, ctx);
			},
			async queue(batch: MessageBatch<EmailMessage>, env: Env): Promise<void> {
				return handleQueue(batch, env);
			},
		} as {
			fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
			queue: (batch: MessageBatch<EmailMessage>, env: Env) => Promise<void>;
		},
	};
}

