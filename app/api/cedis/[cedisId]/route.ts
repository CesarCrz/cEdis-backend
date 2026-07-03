import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'

const patchSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().max(500).nullable().optional(),
})

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withAuth(req, cedisId, async () => {
    const { data, error } = await supabaseAdmin
      .from('cedis')
      .select('*')
      .eq('id', cedisId)
      .single()

    if (error || !data) {
      return err('NOT_FOUND', 'CEDIS not found', 404)
    }

    return ok(data)
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withAuth(req, cedisId, async (ctx) => {
    if (!requireRole('admin', ctx.role)) {
      return err('FORBIDDEN', 'Insufficient permissions', 403)
    }

    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.nombre !== undefined) updates.nombre = parsed.data.nombre
    if (parsed.data.descripcion !== undefined) updates.descripcion = parsed.data.descripcion

    if (Object.keys(updates).length === 0) {
      return err('VALIDATION_ERROR', 'No fields to update', 400)
    }

    const { data: before } = await supabaseAdmin
      .from('cedis')
      .select('nombre, descripcion')
      .eq('id', cedisId)
      .single()

    const { data, error } = await supabaseAdmin
      .from('cedis')
      .update(updates)
      .eq('id', cedisId)
      .select()
      .single()

    if (error || !data) {
      return err('DB_ERROR', 'Failed to update CEDIS', 500)
    }

    await logAction(cedisId, ctx.userId, 'update', 'cedis', cedisId, before, updates)

    return ok(data)
  })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withAuth(req, cedisId, async (ctx) => {
    if (ctx.role !== 'owner') {
      return err('FORBIDDEN', 'Only the owner can delete a CEDIS', 403)
    }

    // Require explicit confirmation header to prevent accidental deletion
    if (req.headers.get('x-confirm-delete') !== 'true') {
      return err('CONFIRMATION_REQUIRED', 'Add header x-confirm-delete: true to confirm deletion', 400)
    }

    const { error } = await supabaseAdmin
      .from('cedis')
      .delete()
      .eq('id', cedisId)

    if (error) {
      return err('DB_ERROR', 'Failed to delete CEDIS', 500)
    }

    return ok({ deleted: true })
  })
}
