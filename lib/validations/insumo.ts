import { z } from 'zod'

export const createInsumoSchema = z.object({
  nombre: z.string().min(1).max(200),
  sku: z.string().min(1).max(100).optional(),
  categoria_id: z.string().uuid().optional().nullable(),
  unidad_id: z.string().uuid(),
  costo_unitario: z.number().min(0),
  stock_minimo: z.number().min(0).default(0),
  stock_inicial: z.number().min(0).default(0),
  proveedor_id: z.string().uuid().optional().nullable(),
})

export const updateInsumoSchema = createInsumoSchema
  .omit({ stock_inicial: true })
  .partial()
