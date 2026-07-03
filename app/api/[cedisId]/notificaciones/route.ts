import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { ok, err } from '@/lib/utils/response'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId }) => {
      const { data, error } = await supabaseAdmin
        .from('notificaciones')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('usuario_id', userId)
        .order('leida', { ascending: true }) // unread first
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) return err('DB_ERROR', 'Failed to fetch notificaciones', 500)
      return ok(data ?? [])
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
