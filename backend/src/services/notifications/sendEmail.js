import { supabase } from '../../lib/supabase.js';
import { Resend } from 'resend';

/**
 * Sends an Email notification using Resend, falling back to a console stub if credentials are missing.
 * Logs the outcome to the notifications table.
 * 
 * @param {string} userId The UUID of the recipient user (patient or doctor)
 * @param {string} to Email address of the recipient
 * @param {string} subject Subject of the email
 * @param {string} html HTML body content
 * @param {string} type Notification type (e.g. 'booking_confirmed', 'doctor_invited')
 * @returns {Promise<boolean>}
 */
export async function sendEmail(userId, to, subject, html, type = 'general') {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  let success = false;
  let payload = { to, subject, from: fromEmail };

  if (resendKey && resendKey !== 'your-resend-api-key') {
    try {
      const resend = new Resend(resendKey);
      const emailResult = await resend.emails.send({
        from: fromEmail,
        to,
        subject,
        html
      });
      payload.emailId = emailResult.id || emailResult.data?.id;
      success = true;
      console.log(`[EMAIL SENT] Email ID: ${payload.emailId} to ${to}`);
    } catch (err) {
      console.error('[EMAIL ERROR] Resend send failed:', err);
      payload.error = err.message;
    }
  } else {
    console.log(`[EMAIL STUB] To: ${to || 'Unknown Email'} | Subject: ${subject}\nBody: ${html}`);
    success = true; // Mark as true so testing logs record success
    payload.stub = true;
  }

  // Log notification to DB
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        channel: 'email',
        type,
        payload
      });
    if (error) {
      console.error('[DATABASE ERROR] Failed to log email notification:', error);
    }
  } catch (dbErr) {
    console.error('[DATABASE ERROR] Exception logging email notification:', dbErr);
  }

  return success;
}
export default sendEmail;
