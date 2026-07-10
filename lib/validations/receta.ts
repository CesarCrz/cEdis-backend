import { z } from 'zod'

export const ingredienteSchema = z.object({
  insumo_id: z.string().uuid().optional().nullable(),
  sub_receta_id: z.string().uuid().optional().nullable(),
  variacion_id: z.string().uuid().optional().nullable(),
  cantidad: z.number().positive(),
  unidad_id: z.string().uuid(),
}).refine(
  (d) => (d.insumo_id != null) !== (d.sub_receta_id != null),
  { message: 'Provide either insumo_id or sub_receta_id, not both or neither' }
)

export const variacionSchema = z.object({
  nombre: z.string().min(1).max(100),
  es_default: z.boolean().default(false),
  ingredientes: z.array(ingredienteSchema).min(1),
})

export const createRecetaSchema = z.object({
  nombre: z.string().min(1).max(200),
  categoria_id: z.string().uuid().optional().nullable(),
  rendimiento: z.number().positive().default(1),
  rendimiento_unidad_id: z.string().uuid().optional().nullable(),
  variaciones: z.array(variacionSchema).optional(),
  ingredientes: z.array(ingredienteSchema).optional(),
})

export const updateRecetaSchema = createRecetaSchema.partial()
