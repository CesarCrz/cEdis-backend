import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry, updateInsumoStock } from '@/lib/services/kardex.service'
import { checkAndNotifyLowStock, getCedisMemberIds } from '@/lib/services/stock-alert.service'
import { toBaseUnits } from '@/lib/utils/unit-conversion'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: ticket, error } = await supabaseAdmin
        .from('tickets_venta')
        .select(`
          *,
          items:ticket_items(
            *,
            insumo:insumos(id,stock_actual,stock_minimo),
            unidad:unidades_medida(id,factor)
          )
        `)
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (error || !ticket) return err('NOT_FOUND', 'Ticket not found', 404)
      if (ticket.status === 'delivered') return ok(ticket) // idempotent
      if (ticket.status !== 'confirmed') return err('CONFLICT', `Cannot deliver ticket with status: ${ticket.status}`, 409)

      const memberIds = await getCedisMemberIds(cedisId)

      for (const item of (ticket.items ?? [])) {
        const factor = Number(item.unidad?.factor ?? 1)
        const deltaBase = toBaseUnits(Number(item.cantidad), factor)

        const { antes, despues } = await updateInsumoStock(item.insumo_id, -deltaBase)

        await insertKardexEntry({
          cedis_id: cedisId,
          insumo_id: item.insumo_id,
          tipo: 'salida_venta',
          cantidad: -deltaBase,
          unidad_id: item.unidad_id,
          stock_antes: antes,
          stock_despues: despues,
          referencia_tipo: 'ticket_venta',
          referencia_id: id,
          cliente_id: ticket.cliente_id,
          usuario_id: userId,
          notas: `Entrega ticket ${ticket.folio}`,
        })

        // Check low stock after each decrease
        const stockMinimo = Number(item.insumo?.stock_minimo ?? 0)
        await checkAndNotifyLowStock(cedisId, item.insumo_id, despues, stockMinimo, memberIds)
      }

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('tickets_venta')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (upErr) return err('DB_ERROR', 'Failed to mark ticket as delivered', 500)

      await logAction(cedisId, userId, 'deliver', 'ticket_venta', id, { status: 'confirmed' }, { status: 'delivered' })
      return ok(updated)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
