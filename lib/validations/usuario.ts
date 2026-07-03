import { z } from 'zod'

export const inviteUsuarioSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'viewer']),
})

export const updateUsuarioSchema = z.object({
  role: z.enum(['admin', 'viewer']),
})
