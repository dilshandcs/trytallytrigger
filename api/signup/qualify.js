import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_PLANS = new Set([
    'Essentials / Register Lite',
    'Register or higher',
    'Payments / Payment Plus',
    'Not sure'
]);

function verifyLeadToken(token) {
    if (!process.env.LEAD_TOKEN_SECRET) {
        throw new Error('LEAD_TOKEN_SECRET is not configured');
    }

    if (typeof token !== 'string' || !token.includes('.')) {
        return null;
    }

    const parts = token.split('.');

    if (parts.length !== 2) {
        return null;
    }

    const [encodedPayload, providedSignature] = parts;

    const expectedSignature = crypto
        .createHmac('sha256', process.env.LEAD_TOKEN_SECRET)
        .update(encodedPayload)
        .digest('base64url');

    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(providedSignature);

    if (expectedBuffer.length !== providedBuffer.length) {
        return null;
    }

    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return null;
    }

    try {
        const payload = JSON.parse(
            Buffer
                .from(encodedPayload, 'base64url')
                .toString('utf8')
        );

        // Token valid for 24 hours
        if (
            typeof payload.createdAt !== 'number' ||
            Date.now() - payload.createdAt > 24 * 60 * 60 * 1000
        ) {
            return null;
        }

        return payload;

    } catch {
        return null;
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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);

        return res.status(405).json({
            error: `HTTP Method ${req.method} Not Permitted.`
        });
    }

    try {
        console.log('[QUALIFY] Request started');

        const {
            leadToken,
            cloverPlan
        } = req.body || {};

        console.log('[QUALIFY] Plan:', cloverPlan);
        console.log('[QUALIFY] Token exists:', Boolean(leadToken));

        if (!ALLOWED_PLANS.has(cloverPlan)) {
            console.error('[QUALIFY] Invalid plan');

            return res.status(400).json({
                error: 'Invalid Clover plan.'
            });
        }

        const lead = verifyLeadToken(leadToken);

        if (!lead?.email) {
            console.error('[QUALIFY] Invalid token');

            return res.status(401).json({
                error: 'Invalid or expired signup session.'
            });
        }

        console.log('[QUALIFY] Token verified:', lead.email);

        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is not configured');
        }

        if (!process.env.LEAD_NOTIFY_EMAIL) {
            throw new Error('LEAD_NOTIFY_EMAIL is not configured');
        }

        const { data, error } = await resend.emails.send({
            from: 'TallyTrigger <onboarding@resend.dev>',
            to: process.env.LEAD_NOTIFY_EMAIL,
            subject: `Clover plan selected: ${cloverPlan}`,
            html: `
                <h2>Beta lead qualification</h2>

                <p>
                    <strong>Email:</strong>
                    ${escapeHtml(lead.email)}
                </p>

                <p>
                    <strong>Clover plan:</strong>
                    ${escapeHtml(cloverPlan)}
                </p>

                <p>
                    <small>
                        ${new Date().toISOString()}
                    </small>
                </p>
            `
        });

        if (error) {
            console.error('[QUALIFY_RESEND_ERROR]', error);

            return res.status(502).json({
                error: 'Unable to save Clover plan.'
            });
        }

        console.log(
            '[QUALIFY] Email sent:',
            data?.id
        );

        return res.status(200).json({
            success: true
        });

    } catch (error) {
        console.error(
            '[QUALIFY_EXCEPTION]',
            error
        );

        return res.status(500).json({
            error: error?.message || 'Unable to save Clover plan.'
        });
    }
}