import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateFolio } from '@/lib/utils/folio'
import { createTicketSchema } from '@/lib/validations/ticket'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const status = sp.get('status')
      const clienteId = sp.get('cliente_id')
      const fromDate = sp.get('from')
      const toDate = sp.get('to')

      let query = supabaseAdmin
        .from('tickets_venta')
        .select('*, cliente:clientes(id,nombre)', { count: 'exact' })
        .eq('cedis_id', cedisId)

      if (status) query = query.eq('status', status)
      if (clienteId) query = query.eq('cliente_id', clienteId)
      if (fromDate) query = query.gte('created_at', fromDate)
      if (toDate) query = query.lte('created_at', toDate)

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch tickets', 500)
      return paginated(data ?? [], { total: count ?? 0, page, limit })
    })
  )
}

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = createTicketSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { cliente_id, notas, items } = parsed.data

      // Validate cliente belongs to cedis
      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('id')
        .eq('id', cliente_id)
        .eq('cedis_id', cedisId)
        .single()

      if (!cliente) return err('VALIDATION_ERROR', 'Cliente not found in this CEDIS', 400)

      const folio = await generateFolio(supabaseAdmin, cedisId, 'TKT')
      const total = items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0)

      const { data: ticket, error: tktErr } = await supabaseAdmin
        .from('tickets_venta')
        .insert({
          cedis_id: cedisId,
          cliente_id,
          folio,
          notas: notas ?? null,
          status: 'draft',
          usuario_id: userId,
        })
        .select()
        .single()

      if (tktErr) return err('DB_ERROR', 'Failed to create ticket', 500)

      const { error: itemsErr } = await supabaseAdmin
        .from('ticket_items')
        .insert(items.map(item => ({
          ticket_id: ticket.id,
          insumo_id: item.insumo_id,
          unidad_id: item.unidad_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        })))

      if (itemsErr) {
        await supabaseAdmin.from('tickets_venta').delete().eq('id', ticket.id)
        return err('DB_ERROR', 'Failed to create ticket items', 500)
      }

      await logAction(cedisId, userId, 'create', 'ticket_venta', ticket.id, null, { folio, cliente_id, total })
      return ok({ ...ticket, items, total }, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
