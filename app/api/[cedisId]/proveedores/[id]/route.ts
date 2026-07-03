import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateProveedorSchema } from '@/lib/validations/proveedor'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data, error } = await supabaseAdmin
        .from('proveedores')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (error || !data) return err('NOT_FOUND', 'Proveedor not found', 404)
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
      const parsed = updateProveedorSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { data: before, error: fetchErr } = await supabaseAdmin
        .from('proveedores')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !before) return err('NOT_FOUND', 'Proveedor not found', 404)

      const { data, error } = await supabaseAdmin
        .from('proveedores')
        .update(parsed.data)
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .select()
        .single()

      if (error) return err('DB_ERROR', 'Failed to update proveedor', 500)

      await logAction(cedisId, userId, 'update', 'proveedor', id, before, parsed.data)
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

      const { data: prov, error: fetchErr } = await supabaseAdmin
        .from('proveedores')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !prov) return err('NOT_FOUND', 'Proveedor not found', 404)

      // Soft delete
      const { error } = await supabaseAdmin
        .from('proveedores')
        .update({ activo: false })
        .eq('cedis_id', cedisId)
        .eq('id', id)

      if (error) return err('DB_ERROR', 'Failed to deactivate proveedor', 500)

      await logAction(cedisId, userId, 'deactivate', 'proveedor', id)
      return ok({ deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
