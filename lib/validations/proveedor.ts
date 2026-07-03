import { z } from 'zod'

export const createProveedorSchema = z.object({
  nombre: z.string().min(1).max(200),
  contacto: z.string().max(200).optional().nullable(),
  telefono: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
})

export const updateProveedorSchema = createProveedorSchema.partial()
