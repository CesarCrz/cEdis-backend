import { z } from 'zod'

export const createMermaSchema = z.object({
  insumo_id: z.string().uuid(),
  cantidad: z.number().positive(),
  unidad_id: z.string().uuid(),
  motivo: z.string().min(1).max(500),
})
