import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createInsumoSchema } from '@/lib/validations/insumo'

function generateSku(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (const byte of bytes) {
    result += chars[byte % chars.length]
  }
  return `INS-${result}`
}

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const categoriaId = sp.get('categoria_id')
      const proveedorId = sp.get('proveedor_id')
      const alerta = sp.get('alerta')
      const activoParam = sp.get('activo')
      const search = sp.get('search')

      let query = supabaseAdmin
        .from('insumos')
        .select('*, categoria:categorias(id,nombre), proveedor:proveedores(id,nombre), unidad:unidades_medida(id,nombre,simbolo,factor)', { count: 'exact' })
        .eq('cedis_id', cedisId)

      // Default to active unless explicitly set to 'false'
      if (activoParam !== 'false') {
        query = query.eq('activo', true)
      } else {
        query = query.eq('activo', false)
      }

      if (categoriaId) query = query.eq('categoria_id', categoriaId)
      if (proveedorId) query = query.eq('proveedor_id', proveedorId)

      if (search) {
        query = query.or(`nombre.ilike.%${search}%,sku.ilike.%${search}%`)
      }

      // critical filter can be done in SQL
      if (alerta === 'critical') {
        query = query.eq('stock_actual', 0)
      }

      const { data, error, count } = await query
        .order('nombre')
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch insumos', 500)

      // Apply alerta filter in memory for levels that need stock_actual vs stock_minimo comparison
      let result = data ?? []
      if (alerta && alerta !== 'critical') {
        result = result.filter((ins) => {
          const stock = Number(ins.stock_actual)
          const min = Number(ins.stock_minimo)
          switch (alerta) {
            case 'ok':     return stock > min
            case 'warn':   return stock <= min && stock > min * 0.5 && stock > 0
            case 'low':    return stock <= min * 0.5 && stock > 0
            default:       return true
          }
        })
      }

      return paginated(result, { total: count ?? 0, page, limit })
    })
  )
}

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      const body = await req.json().catch(() => null)
      const parsed = createInsumoSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { stock_inicial, ...insumoFields } = parsed.data
      const sku = insumoFields.sku ?? generateSku()

      // Insert insumo with stock_actual = stock_inicial
      const { data: insumo, error: insErr } = await supabaseAdmin
        .from('insumos')
        .insert({
          cedis_id: cedisId,
          ...insumoFields,
          sku,
          stock_actual: stock_inicial,
        })
        .select()
        .single()

      if (insErr) {
        if (insErr.code === '23505') {
          return err('CONFLICT', 'An insumo with this SKU already exists', 409)
        }
        return err('DB_ERROR', 'Failed to create insumo', 500)
      }

      // If stock_inicial > 0, create kardex entry
      if (stock_inicial > 0) {
        await supabaseAdmin.from('kardex').insert({
          cedis_id: cedisId,
          insumo_id: insumo.id,
          tipo: 'ajuste_manual',
          cantidad: stock_inicial,
          unidad_id: insumoFields.unidad_id,
          stock_antes: 0,
          stock_despues: stock_inicial,
          usuario_id: userId,
          notas: 'Stock inicial',
        })
      }

      // Insert initial price history record
      await supabaseAdmin.from('insumo_price_history').insert({
        insumo_id: insumo.id,
        cedis_id: cedisId,
        costo_anterior: 0,
        costo_nuevo: insumoFields.costo_unitario,
        usuario_id: userId,
      })

      await logAction(cedisId, userId, 'create', 'insumo', insumo.id, null, insumo)
      return ok(insumo, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
