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

// Update insumo stock atomically using Postgres advisory lock via RPC.
// Requires DB function: update_insumo_stock(p_insumo_id uuid, p_delta numeric)
export async function updateInsumoStock(
  insumoId: string,
  deltaBase: number // positive=add, negative=subtract
): Promise<{ antes: number; despues: number }> {
  const { data, error } = await supabaseAdmin.rpc('update_insumo_stock', {
    p_insumo_id: insumoId,
    p_delta: deltaBase,
  })

  if (error || !data || data.length === 0) {
    // Fallback (non-atomic) if RPC not yet deployed
    const { data: insumo } = await supabaseAdmin
      .from('insumos')
      .select('stock_actual')
      .eq('id', insumoId)
      .single()
    const antes = Number(insumo?.stock_actual ?? 0)
    const despues = Math.max(0, antes + deltaBase)
    await supabaseAdmin
      .from('insumos')
      .update({ stock_actual: despues, updated_at: new Date().toISOString() })
      .eq('id', insumoId)
    return { antes, despues }
  }

  return {
    antes: Number(data[0].stock_antes),
    despues: Number(data[0].stock_despues),
  }
}
