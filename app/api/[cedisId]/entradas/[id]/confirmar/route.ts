import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry, updateInsumoStock } from '@/lib/services/kardex.service'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: entrada, error: entErr } = await supabaseAdmin
        .from('entradas')
        .select(`
          *,
          items:entrada_items(
            *,
            insumo:insumos(id, stock_actual, costo_unitario, unidad:unidades_medida(id, factor)),
            unidad:unidades_medida(id, factor, simbolo)
          )
        `)
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (entErr || !entrada) return err('NOT_FOUND', 'Entrada not found', 404)

      if (entrada.status === 'confirmed') return ok(entrada)
      if (entrada.status !== 'draft') return err('CONFLICT', `Cannot confirm entrada with status: ${entrada.status}`, 409)

      for (const item of (entrada.items ?? [])) {
        // Convert entrada quantity to insumo's storage unit
        // e.g. entrada in g (factor=1), insumo stored in kg (factor=1000) → delta = qty * 1 / 1000 = 0.003 kg
        // e.g. entrada in kg (factor=1000), insumo stored in kg (factor=1000) → delta = qty * 1000 / 1000 = qty ✓
        const entradaFactor = Number(item.unidad?.factor ?? 1)
        const insumoFactor = Number((item.insumo as { unidad?: { factor?: number } })?.unidad?.factor ?? 1)
        const delta = (Number(item.cantidad) * entradaFactor) / insumoFactor

        const { antes, despues } = await updateInsumoStock(item.insumo_id, delta)

        // Weighted average cost (in insumo's unit)
        const costoAnterior = Number(item.insumo?.costo_unitario ?? 0)
        const costoEntrada = Number(item.costo_unitario ?? 0)
        if (costoEntrada > 0) {
          const nuevoCosto =
            antes > 0
              ? (antes * costoAnterior + delta * costoEntrada) / despues
              : costoEntrada
          await supabaseAdmin
            .from('insumos')
            .update({ costo_unitario: Math.round(nuevoCosto * 10000) / 10000 })
            .eq('id', item.insumo_id)
        }

        await insertKardexEntry({
          cedis_id: cedisId,
          insumo_id: item.insumo_id,
          tipo: 'entrada',
          cantidad: delta,
          unidad_id: item.unidad_id,
          stock_antes: antes,
          stock_despues: despues,
          referencia_tipo: 'entrada',
          referencia_id: id,
          usuario_id: userId,
          notas: `Entrada ${entrada.folio}`,
        })
      }

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('entradas')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (upErr) return err('DB_ERROR', 'Failed to confirm entrada', 500)

      await logAction(cedisId, userId, 'confirm', 'entrada', id, { status: 'draft' }, { status: 'confirmed' })
      return ok(updated)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
