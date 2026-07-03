import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ok, err } from '@/lib/utils/response'
import { rateLimit, getRateLimitKey } from '@/lib/middleware/rate-limit'

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

  // Always return 200 — don't reveal whether the email exists
  await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: parsed.data.email,
  })

  return ok({ message: 'If that email exists, a magic link has been sent.' })
}
