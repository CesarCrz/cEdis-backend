import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { ok, err } from '@/lib/utils/response'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const categoriaId = sp.get('categoria_id')
      const nivel = sp.get('nivel') // 'warn' | 'low' | 'critical'

      let querySimple = supabaseAdmin
        .from('insumos')
        .select('id, sku, nombre, stock_actual, stock_minimo, costo_unitario, categoria:categorias(id,nombre), unidad:unidades_medida(id,simbolo), proveedor:proveedores(id,nombre)')
        .eq('cedis_id', cedisId)
        .eq('activo', true)

      if (categoriaId) querySimple = querySimple.eq('categoria_id', categoriaId)

      const { data: insumos, error } = await querySimple.order('nombre')
      if (error) return err('DB_ERROR', 'Failed to fetch faltantes', 500)

      // Filter: stock_actual <= stock_minimo
      const faltantes = (insumos ?? [])
        .filter(i => Number(i.stock_actual) <= Number(i.stock_minimo))
        .map(i => {
          const stock = Number(i.stock_actual)
          const min = Number(i.stock_minimo)
          const faltante = min - stock

          let semaforo: string
          if (stock === 0) semaforo = 'critical'
          else if (stock <= min * 0.5) semaforo = 'low'
          else semaforo = 'warn'

          return { ...i, faltante, semaforo }
        })
        .filter(i => {
          if (!nivel) return true
          return i.semaforo === nivel
        })
        // Order by faltante DESC (biggest gap first)
        .sort((a, b) => b.faltante - a.faltante)

      return ok(faltantes)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
