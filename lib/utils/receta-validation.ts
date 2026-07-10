import { supabaseAdmin } from '@/lib/supabase/admin'

// BFS to detect if adding candidateSubRecetaId as ingredient of recetaId would create a cycle
export async function wouldCreateCircle(
  recetaId: string,
  candidateSubRecetaId: string
): Promise<boolean> {
  const visited = new Set<string>()
  const queue = [candidateSubRecetaId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === recetaId) return true
    if (visited.has(current)) continue
    visited.add(current)

    const { data } = await supabaseAdmin
      .from('receta_ingredientes')
      .select('sub_receta_id')
      .eq('receta_id', current)
      .not('sub_receta_id', 'is', null)

    for (const row of data ?? []) {
      if (row.sub_receta_id) queue.push(row.sub_receta_id)
    }
  }

  return false
}

// Check list of items for duplicate insumo_id; returns the duplicate id or null
export function findDuplicateInsumo(items: Array<{ insumo_id: string }>): string | null {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.insumo_id)) return item.insumo_id
    seen.add(item.insumo_id)
  }
  return null
}

// Validate that each item's unit tipo matches the insumo's unit tipo.
// Returns an error string if mismatch found, null if all ok.
export async function validateUnitTypes(
  items: Array<{ insumo_id: string; unidad_id: string }>,
  cedisId: string
): Promise<string | null> {
  const insumoIds = [...new Set(items.map(i => i.insumo_id))]
  const unidadIds = [...new Set(items.map(i => i.unidad_id))]

  const [{ data: insumos }, { data: unidades }] = await Promise.all([
    supabaseAdmin
      .from('insumos')
      .select('id, nombre, unidad:unidades_medida(id, tipo)')
      .eq('cedis_id', cedisId)
      .in('id', insumoIds),
    supabaseAdmin
      .from('unidades_medida')
      .select('id, tipo')
      .in('id', unidadIds),
  ])

  const insumoMap = new Map(
    (insumos ?? []).map(i => [
      i.id,
      { nombre: i.nombre as string, tipo: (i.unidad as unknown as { tipo?: string } | null)?.tipo },
    ])
  )
  const unidadTipoMap = new Map((unidades ?? []).map(u => [u.id, u.tipo as string | undefined]))

  for (const item of items) {
    const insumo = insumoMap.get(item.insumo_id)
    const itemTipo = unidadTipoMap.get(item.unidad_id)
    if (insumo?.tipo && itemTipo && insumo.tipo !== itemTipo) {
      return `Unidad incompatible para "${insumo.nombre}": insumo es tipo "${insumo.tipo}", unidad seleccionada es tipo "${itemTipo}"`
    }
  }

  return null
}
