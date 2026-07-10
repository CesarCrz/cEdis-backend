import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Recursively calculates the total production cost of a recipe.
 * Returns cost in MXN for producing `rendimiento` units of `rendimiento_unidad_id`.
 * Pass `visited` to prevent infinite loops.
 */
export async function calcularCostoReceta(
  recetaId: string,
  visited: Set<string> = new Set()
): Promise<number> {
  if (visited.has(recetaId)) return 0
  visited.add(recetaId)

  const { data: receta } = await supabaseAdmin
    .from('recetas')
    .select('rendimiento, rendimiento_unidad_id')
    .eq('id', recetaId)
    .single()

  if (!receta) return 0

  const { data: ingredientes } = await supabaseAdmin
    .from('receta_ingredientes')
    .select(`
      cantidad, unidad_id,
      insumo:insumos(id, costo_unitario, unidad_id),
      sub_receta:recetas!receta_ingredientes_sub_receta_id_fkey(id, rendimiento, rendimiento_unidad_id)
    `)
    .eq('receta_id', recetaId)

  if (!ingredientes?.length) return 0

  // Collect all unit IDs for batch fetch
  const unitIds = new Set<string>()
  for (const ing of ingredientes) {
    if (ing.unidad_id) unitIds.add(ing.unidad_id)
    const insumo = ing.insumo as { unidad_id?: string } | null
    if (insumo?.unidad_id) unitIds.add(insumo.unidad_id)
    const sub = ing.sub_receta as { rendimiento_unidad_id?: string } | null
    if (sub?.rendimiento_unidad_id) unitIds.add(sub.rendimiento_unidad_id)
  }

  const { data: unidades } = await supabaseAdmin
    .from('unidades_medida')
    .select('id, factor')
    .in('id', [...unitIds])

  const factors = new Map<string, number>(
    (unidades ?? []).map((u) => [u.id, Number(u.factor)])
  )

  let totalCosto = 0

  for (const ing of ingredientes) {
    const ingFactor = factors.get(ing.unidad_id) ?? 1
    const cantBase = Number(ing.cantidad) * ingFactor

    const insumo = ing.insumo as unknown as { costo_unitario: number; unidad_id: string } | null
    const sub = ing.sub_receta as unknown as { id: string; rendimiento: number; rendimiento_unidad_id: string } | null

    if (insumo) {
      const insumoFactor = factors.get(insumo.unidad_id) ?? 1
      const costoPerBase = insumoFactor > 0 ? Number(insumo.costo_unitario) / insumoFactor : 0
      totalCosto += cantBase * costoPerBase
    } else if (sub) {
      const subCosto = await calcularCostoReceta(sub.id, new Set(visited))
      const rendFactor = factors.get(sub.rendimiento_unidad_id) ?? 1
      const rendBase = Number(sub.rendimiento) * rendFactor
      const costoPerBase = rendBase > 0 ? subCosto / rendBase : 0
      totalCosto += cantBase * costoPerBase
    }
  }

  return totalCosto
}

/**
 * After saving a receta, find any insumo linked via receta_id and auto-update its costo_unitario.
 */
export async function syncLinkedInsumo(recetaId: string, cedisId: string): Promise<void> {
  const { data: insumo } = await supabaseAdmin
    .from('insumos')
    .select('id, unidad_id')
    .eq('receta_id', recetaId)
    .eq('cedis_id', cedisId)
    .maybeSingle()

  if (!insumo) return

  const { data: receta } = await supabaseAdmin
    .from('recetas')
    .select('rendimiento, rendimiento_unidad_id')
    .eq('id', recetaId)
    .single()

  if (!receta?.rendimiento_unidad_id) return

  const totalCosto = await calcularCostoReceta(recetaId)

  const { data: units } = await supabaseAdmin
    .from('unidades_medida')
    .select('id, factor')
    .in('id', [receta.rendimiento_unidad_id, insumo.unidad_id])

  const factors = new Map((units ?? []).map((u) => [u.id, Number(u.factor)]))
  const rendFactor = factors.get(receta.rendimiento_unidad_id) ?? 1
  const insumoFactor = factors.get(insumo.unidad_id) ?? 1
  const rendBase = Number(receta.rendimiento) * rendFactor
  const costoPerInsumoUnit = rendBase > 0 ? (totalCosto / rendBase) * insumoFactor : 0

  await supabaseAdmin
    .from('insumos')
    .update({ costo_unitario: costoPerInsumoUnit })
    .eq('id', insumo.id)
}
