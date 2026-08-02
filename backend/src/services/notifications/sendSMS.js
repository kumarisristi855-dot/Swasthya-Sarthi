import { supabase } from '../../lib/supabase.js';
import twilio from 'twilio';

/**
 * Sends an SMS notification using Twilio, falling back to a console stub if credentials are missing.
 * Logs the outcome to the notifications table.
 * 
 * @param {string} userId The UUID of the recipient user (patient or doctor)
 * @param {string} to Phone number of the recipient
 * @param {string} body Message content
 * @param {string} type Notification type (e.g. 'booking_confirmed', 'cancelled')
 * @param {object} metadata Extra fields to persist in the notification payload
 * @returns {Promise<boolean>}
 */
export async function sendSMS(userId, to, body, type = 'general', metadata = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  let success = false;
  let payload = { to, body, ...metadata };

  if (accountSid && authToken && fromNumber && accountSid !== 'your-twilio-account-sid') {
    try {
      const client = twilio(accountSid, authToken);
      const message = await client.messages.create({
        body,
        from: fromNumber,
        to
      });
      payload.messageSid = message.sid;
      success = true;
      console.log(`[SMS SENT] Message SID: ${message.sid} to ${to}`);
    } catch (err) {
      console.error('[SMS ERROR] Twilio send failed:', err);
      payload.error = err.message;
    }
  } else {
    console.log(`[SMS STUB] To: ${to || 'Unknown Phone'} | Body: ${body}`);
    success = true; // Mark as true so testing logs record success
    payload.stub = true;
  }

  // Log notification to DB
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        channel: 'sms',
        type,
        payload
      });
    if (error) {
      console.error('[DATABASE ERROR] Failed to log SMS notification:', error);
    }
  } catch (dbErr) {
    console.error('[DATABASE ERROR] Exception logging SMS notification:', dbErr);
  }

  return success;
}
export default sendSMS;
