import { z } from 'zod'

export const ingredienteSchema = z.object({
  insumo_id: z.string().uuid(),
  variacion_id: z.string().uuid().optional().nullable(),
  cantidad: z.number().positive(),
  unidad_id: z.string().uuid(),
})

export const variacionSchema = z.object({
  nombre: z.string().min(1).max(100),
  es_default: z.boolean().default(false),
  ingredientes: z.array(ingredienteSchema).min(1),
})

export const createRecetaSchema = z.object({
  nombre: z.string().min(1).max(200),
  variaciones: z.array(variacionSchema).optional(),
  ingredientes: z.array(ingredienteSchema).optional(),
})

export const updateRecetaSchema = createRecetaSchema.partial()
