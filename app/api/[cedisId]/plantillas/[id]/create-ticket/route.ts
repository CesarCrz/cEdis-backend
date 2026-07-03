import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateFolio } from '@/lib/utils/folio'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      // Fetch plantilla with items
      const { data: plantilla, error: plantillaErr } = await supabaseAdmin
        .from('plantillas_pedido')
        .select('*, items:plantilla_items(insumo_id, unidad_id, cantidad)')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (plantillaErr || !plantilla) return err('NOT_FOUND', 'Plantilla not found', 404)

      if (!plantilla.items || plantilla.items.length === 0) {
        return err('VALIDATION_ERROR', 'Plantilla has no items', 400)
      }

      // Generate folio
      const folio = await generateFolio(supabaseAdmin, cedisId, 'TKT')

      // Create draft ticket
      const { data: ticket, error: ticketErr } = await supabaseAdmin
        .from('tickets_venta')
        .insert({
          cedis_id: cedisId,
          cliente_id: plantilla.cliente_id,
          folio,
          status: 'draft',
          usuario_id: userId,
          notas: `Generado desde plantilla: ${plantilla.nombre}`,
        })
        .select()
        .single()

      if (ticketErr || !ticket) {
        return err('DB_ERROR', 'Failed to create ticket', 500)
      }

      // Copy plantilla items to ticket items
      const ticketItems = (plantilla.items as Array<{ insumo_id: string; unidad_id: string; cantidad: number }>).map((item) => ({
        ticket_id: ticket.id,
        insumo_id: item.insumo_id,
        unidad_id: item.unidad_id,
        cantidad: item.cantidad,
        precio_unitario: 0, // Default — to be filled by user
      }))

      const { error: itemsErr } = await supabaseAdmin
        .from('ticket_items')
        .insert(ticketItems)

      if (itemsErr) {
        // Rollback ticket
        await supabaseAdmin.from('tickets_venta').delete().eq('id', ticket.id)
        return err('DB_ERROR', 'Failed to create ticket items', 500)
      }

      await logAction(cedisId, userId, 'create_from_template', 'ticket', ticket.id, { plantilla_id: id }, ticket)
      return ok(ticket, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
