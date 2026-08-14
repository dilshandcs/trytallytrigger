import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

function createLeadToken(email) {
    const normalizedEmail = email.trim().toLowerCase();

    const payload = {
        email: normalizedEmail,
        createdAt: Date.now()
    };

    const encodedPayload = Buffer
        .from(JSON.stringify(payload))
        .toString('base64url');

    const signature = crypto
        .createHmac('sha256', process.env.LEAD_TOKEN_SECRET)
        .update(encodedPayload)
        .digest('base64url');

    return `${encodedPayload}.${signature}`;
}

export default async function handler(req, res) {

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);

        return res.status(405).json({
            error: `HTTP Method ${req.method} Not Permitted.`
        });
    }

    try {
        const {
            email,
            featureRequests,
            eventId
        } = req.body || {};

        const normalizedEmail =
            typeof email === 'string'
                ? email.trim().toLowerCase()
                : '';

        if (
            !normalizedEmail ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                error: 'A valid email address is required.'
            });
        }

        const concerns =
            typeof featureRequests === 'string'
                ? featureRequests.trim().slice(0, 1000)
                : '';

        console.info(
            `[LEAD] ${normalizedEmail}${
                concerns ? ` | ${concerns}` : ''
            }`
        );

        /*
         * Lead notification.
         */
        await resend.emails.send({
            from: 'TallyTrigger <onboarding@resend.dev>',
            to: process.env.LEAD_NOTIFY_EMAIL,
            subject: `New TallyTrigger beta signup: ${normalizedEmail}`,
            html: `
                <h2>New private-beta signup</h2>

                <p>
                    <strong>Email:</strong>
                    ${escapeHtml(normalizedEmail)}
                </p>

                ${
                    concerns
                        ? `
                        <p>
                            <strong>Feature notes:</strong><br>
                            ${escapeHtml(concerns)}
                        </p>
                        `
                        : ''
                }

                <p>
                    <small>${new Date().toISOString()}</small>
                </p>
            `
        });

        /*
         * Meta CAPI
         */

        const hashedEmail = crypto
            .createHash('sha256')
            .update(normalizedEmail)
            .digest('hex');

        let rawIp =
            req.headers['x-forwarded-for'] ||
            req.socket?.remoteAddress ||
            '';

        if (Array.isArray(rawIp)) {
            rawIp = rawIp[0];
        } else if (
            typeof rawIp === 'string' &&
            rawIp.includes(',')
        ) {
            rawIp = rawIp.split(',')[0];
        }

        let ipAddress =
            typeof rawIp === 'string'
                ? rawIp.trim()
                : '';

        if (ipAddress.startsWith('::ffff:')) {
            ipAddress = ipAddress.replace('::ffff:', '');
        }

        if (
            ipAddress === '::1' ||
            ipAddress === '127.0.0.1' ||
            ipAddress === 'localhost'
        ) {
            ipAddress = null;
        }

        const userAgent =
            typeof req.headers['user-agent'] === 'string'
                ? req.headers['user-agent']
                : undefined;

        const pixelId =
            process.env.NEXT_PUBLIC_META_PIXEL_ID;

        const userData = {
            em: [hashedEmail]
        };

        if (userAgent) {
            userData.client_user_agent = userAgent;
        }

        if (ipAddress) {
            userData.client_ip_address = ipAddress;
        }

        /*
         * eventId is important for browser/CAPI deduplication.
         * Only send CAPI if we actually received one.
         */
        if (
            pixelId &&
            process.env.META_CAPI_TOKEN &&
            typeof eventId === 'string' &&
            eventId.length > 0
        ) {
            try {
                const metaResponse = await fetch(
                    `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(
                        process.env.META_CAPI_TOKEN
                    )}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            data: [
                                {
                                    event_name: 'Lead',
                                    event_time: Math.floor(
                                        Date.now() / 1000
                                    ),
                                    event_id: eventId,
                                    action_source: 'website',
                                    user_data: userData
                                }
                            ]
                        })
                    }
                );

                if (!metaResponse.ok) {
                    const metaBody =
                        await metaResponse.text();

                    console.error(
                        '[META_CAPI_ERROR]',
                        metaResponse.status,
                        metaBody
                    );
                }

            } catch (metaError) {
                console.error(
                    '[META_CAPI_EXCEPTION]',
                    metaError
                );
            }
        }

        /*
         * Return signed token used for optional
         * post-signup Clover-plan qualification.
         */
        const leadToken =
            createLeadToken(normalizedEmail);

        return res.status(200).json({
            success: true,
            leadToken,
            message:
                'Success! You’re on the TallyTrigger private-beta list.'
        });

    } catch (error) {
        console.error(
            '[CRITICAL_SIGNUP_EXCEPTION]',
            error
        );

        return res.status(500).json({
            error:
                'Unable to complete signup right now. Please try again.'
        });
    }
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}