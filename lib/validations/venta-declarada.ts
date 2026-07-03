import { z } from 'zod'

export const createVentaDeclaradaSchema = z.object({
  cliente_id: z.string().uuid(),
  canal_id: z.string().uuid(),
  periodo_inicio: z.string().date(),
  periodo_fin: z.string().date(),
  notas: z.string().max(500).optional(),
  items: z.array(z.object({
    receta_id: z.string().uuid(),
    variacion_id: z.string().uuid().optional().nullable(),
    cantidad_vendida: z.number().positive(),
  })).min(1),
})
