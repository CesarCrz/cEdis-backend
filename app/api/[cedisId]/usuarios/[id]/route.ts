import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateUsuarioSchema } from '@/lib/validations/usuario'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      // Only owner can change admin↔viewer roles
      if (!requireRole('owner', role)) return err('FORBIDDEN', 'Solo el propietario puede cambiar roles', 403)

      const body = await req.json().catch(() => null)
      const parsed = updateUsuarioSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { data: member } = await supabaseAdmin
        .from('cedis_members')
        .select('id, role, user_id')
        .eq('cedis_id', cedisId)
        .eq('user_id', id)
        .single()

      if (!member) return err('NOT_FOUND', 'Member not found', 404)

      const { data: updated, error } = await supabaseAdmin
        .from('cedis_members')
        .update({ role: parsed.data.role })
        .eq('cedis_id', cedisId)
        .eq('user_id', id)
        .select()
        .single()

      if (error) return err('DB_ERROR', 'Failed to update role', 500)

      await logAction(cedisId, userId, 'update_role', 'usuario', id, { role: member.role }, { role: parsed.data.role })
      return ok(updated)
    })
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      // Only owner or admin can revoke access
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      // Non-owners cannot remove admins
      const { data: targetMember } = await supabaseAdmin
        .from('cedis_members')
        .select('id, role')
        .eq('cedis_id', cedisId)
        .eq('user_id', id)
        .single()

      if (!targetMember) return err('NOT_FOUND', 'Member not found', 404)
      if (targetMember.role === 'admin' && !requireRole('owner', role)) {
        return err('FORBIDDEN', 'Solo el propietario puede remover administradores', 403)
      }

      await supabaseAdmin
        .from('cedis_members')
        .delete()
        .eq('cedis_id', cedisId)
        .eq('user_id', id)

      await logAction(cedisId, userId, 'revoke_access', 'usuario', id, { role: targetMember.role }, null)
      return ok({ user_id: id, removed: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
