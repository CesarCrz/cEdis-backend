import type { SupabaseClient } from '@supabase/supabase-js'

type FolioPrefix = 'ENT' | 'TKT'

const TABLE_MAP: Record<FolioPrefix, string> = {
  ENT: 'entradas',
  TKT: 'tickets_venta',
}

// Generates a sequential daily folio: ENT-20260702-0001
export async function generateFolio(
  supabase: SupabaseClient,
  cedisId: string,
  prefix: FolioPrefix
): Promise<string> {
  const today = new Date()
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, '')
  const likePattern = `${prefix}-${datePart}-%`
  const table = TABLE_MAP[prefix]

  const { data } = await supabase
    .from(table)
    .select('folio')
    .eq('cedis_id', cedisId)
    .like('folio', likePattern)
    .order('folio', { ascending: false })
    .limit(1)
    .single()

  let sequence = 1
  if (data?.folio) {
    const parts = (data.folio as string).split('-')
    sequence = (parseInt(parts[2] ?? '0', 10) || 0) + 1
  }

  const seq = String(sequence).padStart(4, '0')
  return `${prefix}-${datePart}-${seq}`
}
