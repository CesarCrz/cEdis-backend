import { z } from 'zod'

export const createTicketSchema = z.object({
  cliente_id: z.string().uuid(),
  notas: z.string().max(500).optional(),
  plantilla_id: z.string().uuid().optional().nullable(),
  items: z.array(z.object({
    insumo_id: z.string().uuid(),
    cantidad: z.number().positive(),
    unidad_id: z.string().uuid(),
    precio_unitario: z.number().min(0),
  })).min(1),
})

export const updateTicketSchema = z.object({
  notas: z.string().max(500).optional(),
  items: z.array(z.object({
    insumo_id: z.string().uuid(),
    cantidad: z.number().positive(),
    unidad_id: z.string().uuid(),
    precio_unitario: z.number().min(0),
  })).min(1).optional(),
})

export const batchTicketSchema = z.object({
  cliente_ids: z.array(z.string().uuid()).min(1),
  items: z.array(z.object({
    insumo_id: z.string().uuid(),
    cantidad: z.number().positive(),
    unidad_id: z.string().uuid(),
    precio_unitario: z.number().min(0),
  })).min(1),
  // Optional quantity overrides per client: { [clienteId]: { [insumoId]: cantidad } }
  ajustes: z.record(z.string(), z.record(z.string(), z.number().positive())).optional(),
  notas: z.string().max(500).optional(),
})
