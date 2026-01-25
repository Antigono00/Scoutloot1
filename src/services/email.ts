import { config } from '../config.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface ResendResponse {
  id?: string;
  error?: {
    message: string;
    name: string;
  };
}

/**
 * Send an email using Resend API
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, subject, html, text } = options;

  if (!config.resendApiKey) {
    console.error('[EMAIL] Missing RESEND_API_KEY environment variable');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ScoutLoot <noreply@scoutloot.com>',
        to: [to],
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      }),
    });

    const data = await response.json() as ResendResponse;

    if (!response.ok || data.error) {
      console.error('[EMAIL] Failed to send email:', data.error?.message || 'Unknown error');
      return { success: false, error: data.error?.message || 'Failed to send email' };
    }

    console.log(`[EMAIL] Sent email to ${to}, messageId: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('[EMAIL] Error sending email:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<{ success: boolean; error?: string }> {
  const resetUrl = `${config.appBaseUrl}?reset=${resetToken}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A0A0F; color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 500px; width: 100%; border-collapse: collapse;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="display: inline-flex; align-items: center; gap: 12px;">
                <div style="width: 48px; height: 48px; background: #FFD500; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 28px;">🧱</div>
                <span style="font-size: 24px; font-weight: 700; color: #ffffff;">ScoutLoot</span>
              </div>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background: #16161F; border-radius: 16px; padding: 40px 32px; border: 1px solid rgba(255,255,255,0.1);">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #ffffff; text-align: center;">
                Reset Your Password
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #A0A0B0; line-height: 1.6; text-align: center;">
                We received a request to reset your password. Click the button below to create a new password.
              </p>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 16px 40px; background: #FFD500; color: #0A0A0F; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0 0; font-size: 14px; color: #606070; line-height: 1.6; text-align: center;">
                This link will expire in <strong style="color: #A0A0B0;">1 hour</strong>.
              </p>
              
              <p style="margin: 16px 0 0 0; font-size: 14px; color: #606070; line-height: 1.6; text-align: center;">
                If you didn't request this, you can safely ignore this email.
              </p>
              
              <!-- Fallback URL -->
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1);">
                <p style="margin: 0; font-size: 12px; color: #606070; text-align: center;">
                  If the button doesn't work, copy and paste this link:
                </p>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #FFD500; word-break: break-all; text-align: center;">
                  ${resetUrl}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #606070;">
                © 2026 ScoutLoot. LEGO Deal Radar Europe.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #606070;">
                Made with 🧱 in Europe
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Reset Your Password

We received a request to reset your ScoutLoot password.

Click this link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.

---
ScoutLoot - LEGO Deal Radar Europe
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Reset Your ScoutLoot Password',
    html,
    text,
  });
}

/**
 * Send welcome/verification email (for future use)
 */
export async function sendWelcomeEmail(email: string): Promise<{ success: boolean; error?: string }> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ScoutLoot</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A0A0F; color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 500px; width: 100%; border-collapse: collapse;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="display: inline-flex; align-items: center; gap: 12px;">
                <div style="width: 48px; height: 48px; background: #FFD500; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 28px;">🧱</div>
                <span style="font-size: 24px; font-weight: 700; color: #ffffff;">ScoutLoot</span>
              </div>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background: #16161F; border-radius: 16px; padding: 40px 32px; border: 1px solid rgba(255,255,255,0.1);">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #ffffff; text-align: center;">
                Welcome to ScoutLoot! 🎉
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #A0A0B0; line-height: 1.6; text-align: center;">
                You're all set to start finding the best LEGO deals across Europe.
              </p>
              
              <div style="background: rgba(255, 213, 0, 0.1); border-radius: 12px; padding: 20px; margin: 24px 0;">
                <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #FFD500;">Quick Start:</h3>
                <ol style="margin: 0; padding-left: 20px; color: #A0A0B0; line-height: 1.8;">
                  <li>Add your first LEGO set to track</li>
                  <li>Set your target price</li>
                  <li>Connect Telegram for instant alerts</li>
                </ol>
              </div>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="${config.appBaseUrl}" style="display: inline-block; padding: 16px 40px; background: #FFD500; color: #0A0A0F; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 8px;">
                      Start Tracking Deals
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #606070;">
                © 2026 ScoutLoot. LEGO Deal Radar Europe.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Welcome to ScoutLoot! 🧱',
    html,
  });
}
