import { z } from 'zod'

export const ajusteInventarioSchema = z.object({
  insumo_id: z.string().uuid(),
  cliente_id: z.string().uuid().optional().nullable(), // null = CEDIS inventory
  cantidad_nueva: z.number().min(0),
  motivo: z.string().min(1, 'Motivo requerido').max(500),
})
