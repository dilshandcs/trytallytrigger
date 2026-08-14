import { Resend } from 'resend';
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `HTTP Method ${req.method} Not Permitted.` });
    }

    try {
        const { email, featureRequests, eventId } = req.body;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                error: "Invalid parameters: A verified email address string is required."
            });
        }

        const concerns =
            typeof featureRequests === 'string'
                ? featureRequests.trim().slice(0, 1000)
                : '';

        // Still log for debugging (optional)
        console.info(`[LEAD] ${email}${concerns ? ` | ${concerns}` : ''}`);

        // Email yourself
        await resend.emails.send({
            from: 'CloverExtract <onboarding@resend.dev>', // use your verified domain in production
            to: process.env.LEAD_NOTIFY_EMAIL,
            subject: `New signup: ${email}`,
            html: `
                <h2>New early-access signup</h2>
                <p><strong>Email:</strong> ${email}</p>
                <p><small>${new Date().toISOString()}</small></p>
            `,
        });

        const hashedEmail = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

        // 1. Safely extract IP handling both String and Array headers
let rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

if (Array.isArray(rawIp)) {
    rawIp = rawIp[0];
} else if (typeof rawIp === 'string' && rawIp.includes(',')) {
    rawIp = rawIp.split(',')[0];
}

let ipAddress = typeof rawIp === 'string' ? rawIp.trim() : '';

// 2. Clean IPv6-mapped IPv4 prefixes (e.g. "::ffff:192.168.1.1" -> "192.168.1.1")
if (ipAddress.startsWith('::ffff:')) {
    ipAddress = ipAddress.replace('::ffff:', '');
}

// 3. Prevent sending Localhost / Loopback IPs to Meta CAPI
if (ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress === 'localhost') {
    ipAddress = null; // Do not send invalid local IP to Meta
}

        const userAgent = req.headers['user-agent'];
        const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;


        const userData = {
            em: [hashedEmail],
            client_user_agent: userAgent,
        };
        
        // Only attach client_ip_address if it's a valid public IP
        if (ipAddress) {
            userData.client_ip_address = ipAddress;
        }

        try {
        await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${process.env.META_CAPI_TOKEN}`, {            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [{
                event_name: 'Lead',
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId,             // Must match front-end exactly
                action_source: 'website',
                user_data,
                }],
            }),
            });
        } catch (metaError) {
            console.error("[META_CAPI_ERROR]", metaError);
        }

        return res.status(200).json({
            success: true,
            message: concerns
                ? "Success! Your address and feature notes have been locked into our early-access sandbox test queue."
                : "Success! Your address has been locked into our early-access sandbox test queue."
        });

    } catch (error) {
        console.error("[CRITICAL_SIGNUP_EXCEPTION]", error);
        return res.status(500).json({ error: "Internal core server routing failure experienced." });
    }
}
