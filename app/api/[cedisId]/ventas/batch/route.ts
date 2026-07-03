import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateFolio } from '@/lib/utils/folio'
import { batchTicketSchema } from '@/lib/validations/ticket'

type Params = { params: Promise<{ cedisId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = batchTicketSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { cliente_ids, items: baseItems, ajustes, notas } = parsed.data

      // Validate ALL clientes belong to cedis before creating any
      const { data: clientes, error: cliErr } = await supabaseAdmin
        .from('clientes')
        .select('id, nombre')
        .eq('cedis_id', cedisId)
        .in('id', cliente_ids)

      if (cliErr) return err('DB_ERROR', 'Failed to validate clientes', 500)
      if ((clientes?.length ?? 0) < cliente_ids.length) {
        return err('VALIDATION_ERROR', 'One or more clientes not found in this CEDIS', 400)
      }

      const createdTicketIds: string[] = []

      try {
        const results = await Promise.all(
          cliente_ids.map(async (clienteId) => {
            const folio = await generateFolio(supabaseAdmin, cedisId, 'TKT')

            // Merge base items with per-client quantity overrides
            const clienteAjustes = ajustes?.[clienteId] ?? {}
            const items = baseItems.map(item => ({
              ...item,
              cantidad: clienteAjustes[item.insumo_id] ?? item.cantidad,
            }))

            const total = items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0)

            const { data: ticket, error: tktErr } = await supabaseAdmin
              .from('tickets_venta')
              .insert({
                cedis_id: cedisId,
                cliente_id: clienteId,
                folio,
                notas: notas ?? null,
                status: 'draft',
                usuario_id: userId,
              })
              .select()
              .single()

            if (tktErr || !ticket) throw new Error(`Failed to create ticket for cliente ${clienteId}`)
            createdTicketIds.push(ticket.id)

            const { error: itemsErr } = await supabaseAdmin
              .from('ticket_items')
              .insert(items.map(item => ({
                ticket_id: ticket.id,
                insumo_id: item.insumo_id,
                unidad_id: item.unidad_id,
                cantidad: item.cantidad,
                precio_unitario: item.precio_unitario,
              })))

            if (itemsErr) throw new Error(`Failed to insert items for ticket ${ticket.id}`)

            return { ...ticket, items, total }
          })
        )

        await logAction(cedisId, userId, 'batch_create', 'ticket_venta', undefined, null, {
          count: results.length,
          cliente_ids,
        })

        return ok(results, 201)
      } catch (e) {
        // Rollback: delete all created tickets (cascade deletes items)
        if (createdTicketIds.length > 0) {
          await supabaseAdmin.from('tickets_venta').delete().in('id', createdTicketIds)
        }
        return err('DB_ERROR', 'Batch ticket creation failed, all changes rolled back', 500)
      }
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
