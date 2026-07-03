import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { ok, err } from '@/lib/utils/response'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId }) => {
      const { error, count } = await supabaseAdmin
        .from('notificaciones')
        .update({ leida: true })
        .eq('cedis_id', cedisId)
        .eq('usuario_id', userId)
        .eq('leida', false)

      if (error) return err('DB_ERROR', 'Failed to mark notifications as read', 500)
      return ok({ updated: count ?? 0 })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
