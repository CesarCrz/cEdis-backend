import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateCanalVentaSchema } from '@/lib/validations/canal-venta'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data, error } = await supabaseAdmin
        .from('canales_venta')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (error || !data) return err('NOT_FOUND', 'Canal de venta not found', 404)
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
      const parsed = updateCanalVentaSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { data: before, error: fetchErr } = await supabaseAdmin
        .from('canales_venta')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !before) return err('NOT_FOUND', 'Canal de venta not found', 404)

      const { data, error } = await supabaseAdmin
        .from('canales_venta')
        .update(parsed.data)
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return err('CONFLICT', 'A canal de venta with this name already exists', 409)
        }
        return err('DB_ERROR', 'Failed to update canal de venta', 500)
      }

      await logAction(cedisId, userId, 'update', 'canal_venta', id, before, parsed.data)
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

      const { data: canal, error: fetchErr } = await supabaseAdmin
        .from('canales_venta')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !canal) return err('NOT_FOUND', 'Canal de venta not found', 404)

      // Check if any ventas_declaradas reference this canal
      const { count } = await supabaseAdmin
        .from('ventas_declaradas')
        .select('id', { count: 'exact', head: true })
        .eq('cedis_id', cedisId)
        .eq('canal_id', id)

      if (count && count > 0) {
        return err('CONFLICT', `Cannot delete: ${count} venta(s) declarada(s) use this canal`, 409)
      }

      // Soft delete
      const { error } = await supabaseAdmin
        .from('canales_venta')
        .update({ activo: false })
        .eq('cedis_id', cedisId)
        .eq('id', id)

      if (error) return err('DB_ERROR', 'Failed to deactivate canal de venta', 500)

      await logAction(cedisId, userId, 'deactivate', 'canal_venta', id)
      return ok({ deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
