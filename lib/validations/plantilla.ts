import { z } from 'zod'

export const plantillaItemSchema = z.object({
  insumo_id: z.string().uuid(),
  cantidad: z.number().positive(),
  unidad_id: z.string().uuid(),
})

export const createPlantillaSchema = z.object({
  nombre: z.string().min(1).max(200),
  cliente_id: z.string().uuid(),
  items: z.array(plantillaItemSchema).min(1),
})

export const updatePlantillaSchema = createPlantillaSchema.partial()
