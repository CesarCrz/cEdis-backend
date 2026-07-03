import { z } from 'zod'

export const createCategoriaSchema = z.object({
  nombre: z.string().min(1).max(100),
})

export const updateCategoriaSchema = createCategoriaSchema.partial()
