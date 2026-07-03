import { supabaseAdmin } from '@/lib/supabase/admin'

export interface KardexEntry {
  cedis_id: string
  insumo_id: string
  tipo: 'entrada' | 'salida_venta' | 'ajuste_manual' | 'venta_declarada' | 'merma'
  cantidad: number // positive=in, negative=out (in base units)
  unidad_id: string
  stock_antes: number
  stock_despues: number
  referencia_tipo?: string
  referencia_id?: string
  cliente_id?: string | null
  canal_id?: string | null
  usuario_id: string
  notas?: string
}

export async function insertKardexEntry(entry: KardexEntry): Promise<void> {
  await supabaseAdmin.from('kardex').insert(entry)
}

// Update insumo stock atomically and return before/after values
export async function updateInsumoStock(
  insumoId: string,
  deltaBase: number // positive=add, negative=subtract
): Promise<{ antes: number; despues: number }> {
  const { data: insumo } = await supabaseAdmin
    .from('insumos')
    .select('stock_actual')
    .eq('id', insumoId)
    .single()

  const antes = Number(insumo?.stock_actual ?? 0)
  const despues = Math.max(0, antes + deltaBase) // never go below 0

  await supabaseAdmin
    .from('insumos')
    .update({ stock_actual: despues, updated_at: new Date().toISOString() })
    .eq('id', insumoId)

  return { antes, despues }
}
