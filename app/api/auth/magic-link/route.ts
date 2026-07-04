import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ok, err } from '@/lib/utils/response'
import { rateLimit, getRateLimitKey } from '@/lib/middleware/rate-limit'
import { sendEmail, getMagicLinkTemplate } from '@/lib/email'

const bodySchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  const key = getRateLimitKey(req, 'magic-link')
  if (!rateLimit(key, 3, 60_000)) {
    return err('RATE_LIMITED', 'Too many requests. Try again in a minute.', 429)
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
  }

  const { email } = parsed.data
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://cedis.ceats.app'

  // Generate link without sending — Supabase does not send email here
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${frontendUrl}/auth/callback`,
    },
  })

  // Send via Resend only if link was generated successfully
  if (!linkError && linkData?.properties?.action_link) {
    await sendEmail(email, getMagicLinkTemplate(email, linkData.properties.action_link))
  }

  // Always return 200 — don't reveal whether the email exists
  return ok({ message: 'If that email exists, a magic link has been sent.' })
}
