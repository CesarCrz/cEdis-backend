import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      // Verify insumo belongs to this cedis
      const { data: insumo, error: checkErr } = await supabaseAdmin
        .from('insumos')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (checkErr || !insumo) return err('NOT_FOUND', 'Insumo not found', 404)

      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const { data, error, count } = await supabaseAdmin
        .from('insumo_price_history')
        .select('*', { count: 'exact' })
        .eq('cedis_id', cedisId)
        .eq('insumo_id', id)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch price history', 500)

      return paginated(data ?? [], { total: count ?? 0, page, limit })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
