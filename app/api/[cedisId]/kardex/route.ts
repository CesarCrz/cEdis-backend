import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { paginated, err } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const insumoId = sp.get('insumo_id')
      const tipo = sp.get('tipo')
      const clienteId = sp.get('cliente_id')
      const canalId = sp.get('canal_id')
      const fromDate = sp.get('from')
      const toDate = sp.get('to')

      let query = supabaseAdmin
        .from('kardex')
        .select(`
          *,
          insumo:insumos(id,nombre,sku),
          unidad:unidades_medida(id,nombre,simbolo),
          cliente:clientes(id,nombre),
          canal:canales_venta(id,nombre),
          usuario:profiles(id,full_name)
        `, { count: 'exact' })
        .eq('cedis_id', cedisId)

      if (insumoId) query = query.eq('insumo_id', insumoId)
      if (tipo) query = query.eq('tipo', tipo)
      if (clienteId) query = query.eq('cliente_id', clienteId)
      if (canalId) query = query.eq('canal_id', canalId)
      if (fromDate) query = query.gte('created_at', fromDate)
      if (toDate) query = query.lte('created_at', toDate)

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch kardex', 500)
      return paginated(data ?? [], { total: count ?? 0, page, limit })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
