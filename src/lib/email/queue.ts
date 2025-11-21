/**
 * Cloudflare Queue integration for email sending
 */

export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text?: string;
}

export interface MagicLinkEmailData {
	email: string;
	token: string;
	magicLinkUrl: string;
}

/**
 * Generate magic link email HTML content
 */
export function generateMagicLinkEmail(data: MagicLinkEmailData): EmailMessage {
	const { email, token, magicLinkUrl } = data;
	const fullUrl = `${magicLinkUrl}?token=${token}`;

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Logo CDN API Key</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
		<h1 style="color: #2337ff;">Logo CDN API Key</h1>
		<p>Hello,</p>
		<p>You requested an API key for Logo CDN. Click the link below to view your API key and usage statistics:</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${fullUrl}" style="background-color: #2337ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View API Key</a>
		</div>
		<p style="font-size: 12px; color: #666;">This link will expire in 24 hours.</p>
		<p style="font-size: 12px; color: #666;">If you didn't request this, please ignore this email.</p>
		<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
		<p style="font-size: 12px; color: #999;">Logo Service</p>
	</div>
</body>
</html>
	`.trim();

	const text = `
Logo CDN API Key

Hello,

You requested an API key for Logo CDN. Visit the following link to view your API key and usage statistics:

${fullUrl}

This link will expire in 24 hours.

If you didn't request this, please ignore this email.

Logo CDN Service
	`.trim();

	return {
		to: email,
		subject: 'Your Logo CDN API Key',
		html,
		text,
	};
}

/**
 * Send email message to queue
 * @param queue - Cloudflare Queue binding
 * @param message - Email message to send
 */
export async function sendEmailToQueue(queue: Queue<EmailMessage>, message: EmailMessage): Promise<void> {
	await queue.send(message);
}

