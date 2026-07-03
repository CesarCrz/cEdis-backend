import { z } from 'zod'

export const createClienteSchema = z.object({
  nombre: z.string().min(1).max(200),
  telefono: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
})

export const updateClienteSchema = createClienteSchema.partial()
