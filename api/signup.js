import { Resend } from 'resend';
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `HTTP Method ${req.method} Not Permitted.` });
    }

    try {
        const { email, cloverPlan, featureRequests, eventId } = req.body;

        const ALLOWED_PLANS = ['Register Lite/Essentials', 'Register'];

        if (!cloverPlan || !ALLOWED_PLANS.includes(cloverPlan)) {
            return res.status(400).json({
                error: "Please select a valid, compatible Clover plan (Register Lite/Essentials or Register)."
            });
        }

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
                <p><strong>Clover Plan:</strong> ${cloverPlan}</p>
                <p>${concerns ? concerns.replace(/\n/g, '<br>') : '<em>(none)</em>'}</p>
                <p><small>${new Date().toISOString()}</small></p>
            `,
        });

        const hashedEmail = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
        let ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ipAddress && ipAddress.includes(',')) {
            ipAddress = ipAddress.split(',')[0].trim(); // Fixed splitting array bug
        }
        const userAgent = req.headers['user-agent'];
        const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

        try {
        await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${process.env.META_CAPI_TOKEN}`, {            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: [{
                event_name: 'Lead',
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId,             // Must match front-end exactly
                action_source: 'website',
                user_data: { 
                    em: [hashedEmail],
                    client_ip_address: ipAddress, // Helps Meta match the profile
                    client_user_agent: userAgent  // Helps Meta match the profile
                },
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
