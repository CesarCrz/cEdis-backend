import { z } from 'zod'

export const createEntradaSchema = z.object({
  proveedor_id: z.string().uuid().optional().nullable(),
  notas: z.string().max(500).optional(),
  items: z.array(z.object({
    insumo_id: z.string().uuid(),
    cantidad: z.number().positive(),
    unidad_id: z.string().uuid(),
    costo_unitario: z.number().min(0),
  })).min(1, 'Al menos un item requerido'),
})

export const updateEntradaSchema = z.object({
  proveedor_id: z.string().uuid().optional().nullable(),
  notas: z.string().max(500).optional(),
  items: z.array(z.object({
    insumo_id: z.string().uuid(),
    cantidad: z.number().positive(),
    unidad_id: z.string().uuid(),
    costo_unitario: z.number().min(0),
  })).min(1, 'Al menos un item requerido').optional(),
})
