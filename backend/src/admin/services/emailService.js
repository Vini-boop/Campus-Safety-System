/**
 * emailService.js
 * Sends transactional emails via Nodemailer (Gmail SMTP).
 *
 * Required env vars:
 *   EMAIL_USER     — Gmail address (e.g. campussafety@gmail.com)
 *   EMAIL_PASS     — Gmail App Password (NOT your account password)
 *                    Generate at: https://myaccount.google.com/apppasswords
 *   EMAIL_FROM     — Display name + address, e.g. "Campus Safety <campussafety@gmail.com>"
 */
import nodemailer from 'nodemailer';

let _transporter = null;

function getTransporter() {
    if (_transporter) return _transporter;

    _transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    return _transporter;
}

/**
 * Send a password-reset verification code email.
 * @param {string} toEmail   - Recipient email address
 * @param {string} code      - 6-digit verification code
 * @param {string} userName  - Recipient's display name (optional)
 */
export async function sendPasswordResetEmail(toEmail, code, userName = 'Student') {
    const from = process.env.EMAIL_FROM || `"Campus Safety" <${process.env.EMAIL_USER}>`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0C156D;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;
                         letter-spacing:0.5px;">🛡️ Campus Safety</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
                Password Reset Request
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#1f2937;font-size:15px;">
                Hi <strong>${userName}</strong>,
              </p>
              <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
                We received a request to reset your Campus Safety account password.
                Use the verification code below to complete the process.
              </p>

              <!-- Code box -->
              <div style="background:#f0f4ff;border:2px dashed #0C156D;border-radius:10px;
                          padding:24px;text-align:center;margin:0 0 24px;">
                <p style="margin:0 0 6px;color:#6b7280;font-size:12px;
                           text-transform:uppercase;letter-spacing:1px;">
                  Your verification code
                </p>
                <p style="margin:0;color:#0C156D;font-size:40px;font-weight:800;
                           letter-spacing:10px;">
                  ${code}
                </p>
              </div>

              <p style="margin:0 0 8px;color:#4b5563;font-size:13px;line-height:1.6;">
                ⏰ This code expires in <strong>15 minutes</strong>.
              </p>
              <p style="margin:0 0 24px;color:#4b5563;font-size:13px;line-height:1.6;">
                If you did not request a password reset, you can safely ignore this email.
                Your password will not be changed.
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;"/>

              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                This email was sent by Campus Safety System.<br/>
                Do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Campus Safety — Password Reset\n\nHi ${userName},\n\nYour verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, ignore this email.`;

    await getTransporter().sendMail({
        from,
        to: toEmail,
        subject: '🔐 Your Campus Safety Password Reset Code',
        text,
        html,
    });
}
