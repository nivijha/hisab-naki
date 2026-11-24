import { HttpError } from '../../middleware/authenticate.js';
import type { OtpDelivery } from './signupService.js';

/**
 * Sends codes through the deployment-owned SMS/WhatsApp gateway. The gateway
 * contract is intentionally isolated here; no OTP is returned to the caller
 * or written to application logs.
 */
export class HttpOtpDelivery implements OtpDelivery {
  async sendSignupCode(phone: string, code: string, expiresInSeconds: number): Promise<void> {
    const endpoint = process.env.OTP_DELIVERY_URL;
    const bearer = process.env.OTP_DELIVERY_TOKEN;
    if (!endpoint || !bearer) throw new HttpError(503, 'Phone verification delivery is not configured.');

    let url: URL;
    try { url = new URL(endpoint); } catch { throw new HttpError(503, 'Phone verification delivery is not configured.'); }
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new HttpError(503, 'Phone verification delivery must use HTTPS.');
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to: phone,
          channel: process.env.OTP_DELIVERY_CHANNEL === 'WHATSAPP' ? 'WHATSAPP' : 'SMS',
          template: 'hisabnaki-signup-verification',
          code,
          expiresInSeconds,
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new HttpError(503, 'Phone verification delivery is temporarily unavailable.');
    }
    if (!response.ok) throw new HttpError(503, 'Phone verification delivery is temporarily unavailable.');
  }
}
