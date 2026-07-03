import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateFolio } from '@/lib/utils/folio'
import { createEntradaSchema } from '@/lib/validations/entrada'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const status = sp.get('status')
      const proveedorId = sp.get('proveedor_id')
      const fromDate = sp.get('from')
      const toDate = sp.get('to')

      let query = supabaseAdmin
        .from('entradas')
        .select('*, proveedor:proveedores(id,nombre)', { count: 'exact' })
        .eq('cedis_id', cedisId)

      if (status) query = query.eq('status', status)
      if (proveedorId) query = query.eq('proveedor_id', proveedorId)
      if (fromDate) query = query.gte('created_at', fromDate)
      if (toDate) query = query.lte('created_at', toDate)

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch entradas', 500)
      return paginated(data ?? [], { total: count ?? 0, page, limit })
    })
  )
}

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = createEntradaSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { proveedor_id, notas, items } = parsed.data

      // Validate insumos belong to cedis
      const insumoIds = [...new Set(items.map(i => i.insumo_id))]
      const { data: insumos, error: insErr } = await supabaseAdmin
        .from('insumos')
        .select('id')
        .eq('cedis_id', cedisId)
        .in('id', insumoIds)

      if (insErr || (insumos?.length ?? 0) < insumoIds.length) {
        return err('VALIDATION_ERROR', 'One or more insumos not found in this CEDIS', 400)
      }

      const folio = await generateFolio(supabaseAdmin, cedisId, 'ENT')

      // Calculate total cost
      const total_costo = items.reduce((sum, item) => sum + item.cantidad * item.costo_unitario, 0)

      const { data: entrada, error: entErr } = await supabaseAdmin
        .from('entradas')
        .insert({
          cedis_id: cedisId,
          folio,
          proveedor_id: proveedor_id ?? null,
          notas: notas ?? null,
          status: 'draft',
          usuario_id: userId,
        })
        .select()
        .single()

      if (entErr) return err('DB_ERROR', 'Failed to create entrada', 500)

      const { error: itemsErr } = await supabaseAdmin
        .from('entrada_items')
        .insert(items.map(item => ({
          entrada_id: entrada.id,
          insumo_id: item.insumo_id,
          unidad_id: item.unidad_id,
          cantidad: item.cantidad,
          costo_unitario: item.costo_unitario,
        })))

      if (itemsErr) {
        await supabaseAdmin.from('entradas').delete().eq('id', entrada.id)
        return err('DB_ERROR', 'Failed to create entrada items', 500)
      }

      await logAction(cedisId, userId, 'create', 'entrada', entrada.id, null, { folio, total_costo })
      return ok({ ...entrada, items, total_costo }, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
