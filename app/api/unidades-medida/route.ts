import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ok, err } from '@/lib/utils/response'

export async function GET(req: NextRequest) {
  return withCors(req, async () => {
    const { data, error } = await supabaseAdmin
      .from('unidades_medida')
      .select('*')
      .order('tipo')
      .order('nombre')

    if (error) {
      return err('DB_ERROR', 'Failed to fetch units of measure', 500)
    }

    const response = ok(data ?? [])
    response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600')
    return response
  })
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
