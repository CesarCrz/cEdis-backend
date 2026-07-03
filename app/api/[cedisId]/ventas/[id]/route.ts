import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateTicketSchema } from '@/lib/validations/ticket'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data: ticket, error } = await supabaseAdmin
        .from('tickets_venta')
        .select(`
          *,
          cliente:clientes(id,nombre,direccion,telefono,email),
          items:ticket_items(
            *,
            insumo:insumos(id,nombre,sku),
            unidad:unidades_medida(id,nombre,simbolo)
          )
        `)
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (error || !ticket) return err('NOT_FOUND', 'Ticket not found', 404)
      return ok(ticket)
    })
  )
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: existing } = await supabaseAdmin
        .from('tickets_venta')
        .select('id, status')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (!existing) return err('NOT_FOUND', 'Ticket not found', 404)
      if (existing.status !== 'draft') return err('CONFLICT', 'Only draft tickets can be updated', 409)

      const body = await req.json().catch(() => null)
      const parsed = updateTicketSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { items, notas } = parsed.data

      if (notas !== undefined) {
        await supabaseAdmin.from('tickets_venta').update({ notas: notas ?? null }).eq('id', id)
      }

      if (items) {
        await supabaseAdmin.from('ticket_items').delete().eq('ticket_id', id)
        await supabaseAdmin.from('ticket_items').insert(
          items.map(item => ({
            ticket_id: id,
            insumo_id: item.insumo_id,
            unidad_id: item.unidad_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
          }))
        )
      }

      const { data: updated } = await supabaseAdmin
        .from('tickets_venta')
        .select('*, items:ticket_items(*)')
        .eq('id', id)
        .single()

      await logAction(cedisId, userId, 'update', 'ticket_venta', id, existing, updated)
      return ok(updated)
    })
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: existing } = await supabaseAdmin
        .from('tickets_venta')
        .select('id, status, folio')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (!existing) return err('NOT_FOUND', 'Ticket not found', 404)
      if (existing.status !== 'draft') return err('CONFLICT', 'Only draft tickets can be cancelled', 409)

      await supabaseAdmin.from('tickets_venta').update({ status: 'cancelled' }).eq('id', id)
      await logAction(cedisId, userId, 'cancel', 'ticket_venta', id, existing, { status: 'cancelled' })
      return ok({ id, status: 'cancelled' })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
