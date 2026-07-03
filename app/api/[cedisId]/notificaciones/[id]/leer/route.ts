import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { ok, err } from '@/lib/utils/response'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId }) => {
      const { data: notif } = await supabaseAdmin
        .from('notificaciones')
        .select('id')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .eq('usuario_id', userId)
        .single()

      if (!notif) return err('NOT_FOUND', 'Notificacion not found', 404)

      const { data: updated, error } = await supabaseAdmin
        .from('notificaciones')
        .update({ leida: true })
        .eq('id', id)
        .select()
        .single()

      if (error) return err('DB_ERROR', 'Failed to mark notification as read', 500)
      return ok(updated)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
