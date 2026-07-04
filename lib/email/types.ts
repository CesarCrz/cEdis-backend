export interface EmailTemplate {
  subject: string
  html: string
}

export interface SendEmailResult {
  success: boolean
  error?: unknown
}
