import { z } from 'zod'

export const createCanalVentaSchema = z.object({
  nombre: z.string().min(1).max(100),
  comision_pct: z.number().min(0).max(100).default(0),
})

export const updateCanalVentaSchema = createCanalVentaSchema.partial()
