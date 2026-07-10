import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateClienteSchema } from '@/lib/validations/cliente'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data, error } = await supabaseAdmin
        .from('clientes')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (error || !data) return err('NOT_FOUND', 'Cliente not found', 404)
      return ok(data)
    })
  )
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      const body = await req.json().catch(() => null)
      const parsed = updateClienteSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { data: before, error: fetchErr } = await supabaseAdmin
        .from('clientes')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !before) return err('NOT_FOUND', 'Cliente not found', 404)

      const { data, error } = await supabaseAdmin
        .from('clientes')
        .update(parsed.data)
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .select()
        .single()

      if (error) return err('DB_ERROR', 'Failed to update cliente', 500)

      await logAction(cedisId, userId, 'update', 'cliente', id, before, parsed.data)
      return ok(data)
    })
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      const { data: cliente, error: fetchErr } = await supabaseAdmin
        .from('clientes')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !cliente) return err('NOT_FOUND', 'Cliente not found', 404)

      // Guard: pending tickets for this cliente
      const { data: ticketsPendientes } = await supabaseAdmin
        .from('tickets_venta')
        .select('id')
        .eq('cliente_id', id)
        .eq('cedis_id', cedisId)
        .in('status', ['draft', 'confirmed'])
        .limit(1)

      if (ticketsPendientes && ticketsPendientes.length > 0) {
        return err('CONFLICT', 'No se puede desactivar: cliente tiene tickets pendientes', 409)
      }

      // Soft delete
      const { error } = await supabaseAdmin
        .from('clientes')
        .update({ activo: false })
        .eq('cedis_id', cedisId)
        .eq('id', id)

      if (error) return err('DB_ERROR', 'Failed to deactivate cliente', 500)

      await logAction(cedisId, userId, 'deactivate', 'cliente', id)
      return ok({ deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
