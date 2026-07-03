import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry, updateInsumoStock } from '@/lib/services/kardex.service'
import { toBaseUnits } from '@/lib/utils/unit-conversion'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: entrada, error: entErr } = await supabaseAdmin
        .from('entradas')
        .select('*, items:entrada_items(*, insumo:insumos(id,stock_actual), unidad:unidades_medida(id,factor,simbolo))')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (entErr || !entrada) return err('NOT_FOUND', 'Entrada not found', 404)

      // Idempotent: if already confirmed, return ok
      if (entrada.status === 'confirmed') return ok(entrada)
      if (entrada.status !== 'draft') return err('CONFLICT', `Cannot confirm entrada with status: ${entrada.status}`, 409)

      // Process each item
      for (const item of (entrada.items ?? [])) {
        const factor = Number(item.unidad?.factor ?? 1)
        const deltaBase = toBaseUnits(Number(item.cantidad), factor)

        const { antes, despues } = await updateInsumoStock(item.insumo_id, deltaBase)

        await insertKardexEntry({
          cedis_id: cedisId,
          insumo_id: item.insumo_id,
          tipo: 'entrada',
          cantidad: deltaBase,
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
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
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
