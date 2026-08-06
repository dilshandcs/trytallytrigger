import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `HTTP Method ${req.method} Not Permitted.` });
    }

    try {
        const { email, featureRequests } = req.body;

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
                <p><strong>Feature requests:</strong></p>
                <p>${concerns ? concerns.replace(/\n/g, '<br>') : '<em>(none)</em>'}</p>
                <p><small>${new Date().toISOString()}</small></p>
            `,
        });

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
