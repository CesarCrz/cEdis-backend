import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry, updateInsumoStock } from '@/lib/services/kardex.service'
import { checkAndNotifyLowStock, getCedisMemberIds } from '@/lib/services/stock-alert.service'

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
            insumo:insumos(id, stock_actual, stock_minimo, nombre, unidad:unidades_medida(id, factor)),
            unidad:unidades_medida(id, factor, simbolo)
          )
        `)
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (error || !ticket) return err('NOT_FOUND', 'Ticket not found', 404)
      if (ticket.status === 'delivered') return ok(ticket)
      if (ticket.status !== 'confirmed') return err('CONFLICT', `Cannot deliver ticket with status: ${ticket.status}`, 409)

      // Validate stock availability for all items before touching anything
      const stockErrors: string[] = []
      for (const item of (ticket.items ?? [])) {
        const entradaFactor = Number(item.unidad?.factor ?? 1)
        const insumoFactor = Number((item.insumo as { unidad?: { factor?: number } })?.unidad?.factor ?? 1)
        const delta = (Number(item.cantidad) * entradaFactor) / insumoFactor
        const stockActual = Number(item.insumo?.stock_actual ?? 0)

        if (stockActual < delta) {
          const nombre = (item.insumo as { nombre?: string })?.nombre ?? item.insumo_id
          const simbolo = item.unidad?.simbolo ?? ''
          stockErrors.push(
            `${nombre}: disponible ${stockActual}${simbolo}, solicitado ${Number(item.cantidad)}${simbolo}`
          )
        }
      }

      if (stockErrors.length > 0) {
        return err('INSUFFICIENT_STOCK', `Stock insuficiente:\n${stockErrors.join('\n')}`, 409)
      }

      const memberIds = await getCedisMemberIds(cedisId)

      for (const item of (ticket.items ?? [])) {
        const entradaFactor = Number(item.unidad?.factor ?? 1)
        const insumoFactor = Number((item.insumo as { unidad?: { factor?: number } })?.unidad?.factor ?? 1)
        const delta = (Number(item.cantidad) * entradaFactor) / insumoFactor

        const { antes, despues } = await updateInsumoStock(item.insumo_id, -delta)

        await insertKardexEntry({
          cedis_id: cedisId,
          insumo_id: item.insumo_id,
          tipo: 'salida_venta',
          cantidad: -delta,
          unidad_id: item.unidad_id,
          stock_antes: antes,
          stock_despues: despues,
          referencia_tipo: 'ticket_venta',
          referencia_id: id,
          cliente_id: ticket.cliente_id,
          usuario_id: userId,
          notas: `Entrega ticket ${ticket.folio}`,
        })

        const stockMinimo = Number(item.insumo?.stock_minimo ?? 0)
        await checkAndNotifyLowStock(cedisId, item.insumo_id, despues, stockMinimo, memberIds)
      }

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('tickets_venta')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
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
