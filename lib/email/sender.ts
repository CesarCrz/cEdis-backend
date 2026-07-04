import { Resend } from 'resend'
import type { EmailTemplate, SendEmailResult } from './types'

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada')
  return new Resend(apiKey)
}

export async function sendEmail(to: string, template: EmailTemplate): Promise<SendEmailResult> {
  try {
    const resend = getResend()
    const from = process.env.RESEND_FROM_EMAIL ?? 'cEdis <noreply@ceats.app>'

    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: template.subject,
      html: template.html,
    })

    if (error) {
      console.error('[email] send error:', error)
      return { success: false, error }
    }

    return { success: true }
  } catch (error) {
    console.error('[email] unexpected error:', error)
    return { success: false, error }
  }
}
