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

    if (
        typeof token !== 'string' ||
        !token.includes('.')
    ) {
        return null;
    }

    const [encodedPayload, providedSignature] =
        token.split('.');

    if (
        !encodedPayload ||
        !providedSignature
    ) {
        return null;
    }

    const expectedSignature = crypto
        .createHmac(
            'sha256',
            process.env.LEAD_TOKEN_SECRET
        )
        .update(encodedPayload)
        .digest('base64url');

    const expectedBuffer =
        Buffer.from(expectedSignature);

    const providedBuffer =
        Buffer.from(providedSignature);

    if (
        expectedBuffer.length !==
        providedBuffer.length
    ) {
        return null;
    }

    if (
        !crypto.timingSafeEqual(
            expectedBuffer,
            providedBuffer
        )
    ) {
        return null;
    }

    try {
        const payload = JSON.parse(
            Buffer
                .from(
                    encodedPayload,
                    'base64url'
                )
                .toString('utf8')
        );

        /*
         * Example token expiry: 24 hours.
         */
        if (
            typeof payload.createdAt !== 'number' ||
            Date.now() - payload.createdAt >
                24 * 60 * 60 * 1000
        ) {
            return null;
        }

        return payload;

    } catch {
        return null;
    }
}

export default async function handler(req, res) {

    if (req.method !== 'POST') {

        res.setHeader(
            'Allow',
            ['POST']
        );

        return res.status(405).json({
            error:
                `HTTP Method ${req.method} Not Permitted.`
        });
    }

    try {

        const {
            leadToken,
            cloverPlan
        } = req.body || {};

        if (
            !ALLOWED_PLANS.has(cloverPlan)
        ) {
            return res.status(400).json({
                error:
                    'Invalid Clover plan.'
            });
        }

        const lead =
            verifyLeadToken(leadToken);

        if (!lead?.email) {
            return res.status(401).json({
                error:
                    'Invalid or expired signup session.'
            });
        }

        /*
         * TEMPORARY VERSION:
         * sends plan qualification by email.
         *
         * Replace this with a DB update before
         * beta traffic becomes meaningful.
         */
        await resend.emails.send({
            from:
                'TallyTrigger <onboarding@resend.dev>',

            to:
                process.env.LEAD_NOTIFY_EMAIL,

            subject:
                `Clover plan: ${cloverPlan}`,

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

        return res.status(200).json({
            success: true
        });

    } catch (error) {

        console.error(
            '[QUALIFY_EXCEPTION]',
            error
        );

        return res.status(500).json({
            error:
                'Unable to save Clover plan.'
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
}import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_PLANS = new Set([
    'Essentials / Register Lite',
    'Register or higher',
    'Payments / Payment Plus',
    'Not sure'
]);

function verifyLeadToken(token) {

    if (
        typeof token !== 'string' ||
        !token.includes('.')
    ) {
        return null;
    }

    const [encodedPayload, providedSignature] =
        token.split('.');

    if (
        !encodedPayload ||
        !providedSignature
    ) {
        return null;
    }

    const expectedSignature = crypto
        .createHmac(
            'sha256',
            process.env.LEAD_TOKEN_SECRET
        )
        .update(encodedPayload)
        .digest('base64url');

    const expectedBuffer =
        Buffer.from(expectedSignature);

    const providedBuffer =
        Buffer.from(providedSignature);

    if (
        expectedBuffer.length !==
        providedBuffer.length
    ) {
        return null;
    }

    if (
        !crypto.timingSafeEqual(
            expectedBuffer,
            providedBuffer
        )
    ) {
        return null;
    }

    try {
        const payload = JSON.parse(
            Buffer
                .from(
                    encodedPayload,
                    'base64url'
                )
                .toString('utf8')
        );

        /*
         * Example token expiry: 24 hours.
         */
        if (
            typeof payload.createdAt !== 'number' ||
            Date.now() - payload.createdAt >
                24 * 60 * 60 * 1000
        ) {
            return null;
        }

        return payload;

    } catch {
        return null;
    }
}

export default async function handler(req, res) {

    if (req.method !== 'POST') {

        res.setHeader(
            'Allow',
            ['POST']
        );

        return res.status(405).json({
            error:
                `HTTP Method ${req.method} Not Permitted.`
        });
    }

    try {

        const {
            leadToken,
            cloverPlan
        } = req.body || {};

        if (
            !ALLOWED_PLANS.has(cloverPlan)
        ) {
            return res.status(400).json({
                error:
                    'Invalid Clover plan.'
            });
        }

        const lead =
            verifyLeadToken(leadToken);

        if (!lead?.email) {
            return res.status(401).json({
                error:
                    'Invalid or expired signup session.'
            });
        }

        /*
         * TEMPORARY VERSION:
         * sends plan qualification by email.
         *
         * Replace this with a DB update before
         * beta traffic becomes meaningful.
         */
        await resend.emails.send({
            from:
                'TallyTrigger <onboarding@resend.dev>',

            to:
                process.env.LEAD_NOTIFY_EMAIL,

            subject:
                `Clover plan: ${cloverPlan}`,

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

        return res.status(200).json({
            success: true
        });

    } catch (error) {

        console.error(
            '[QUALIFY_EXCEPTION]',
            error
        );

        return res.status(500).json({
            error:
                'Unable to save Clover plan.'
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