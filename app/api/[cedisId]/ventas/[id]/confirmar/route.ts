import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: ticket, error } = await supabaseAdmin
        .from('tickets_venta')
        .select('id, status, folio')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (error || !ticket) return err('NOT_FOUND', 'Ticket not found', 404)

      // Idempotent
      if (ticket.status === 'confirmed') return ok(ticket)
      if (ticket.status !== 'draft') return err('CONFLICT', `Cannot confirm ticket with status: ${ticket.status}`, 409)

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('tickets_venta')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (upErr) return err('DB_ERROR', 'Failed to confirm ticket', 500)

      await logAction(cedisId, userId, 'confirm', 'ticket_venta', id, { status: 'draft' }, { status: 'confirmed' })
      return ok(updated)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
