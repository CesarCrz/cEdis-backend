import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry, updateInsumoStock } from '@/lib/services/kardex.service'
import { checkAndNotifyLowStock, getCedisMemberIds } from '@/lib/services/stock-alert.service'
import { toBaseUnits } from '@/lib/utils/unit-conversion'
import { createMermaSchema } from '@/lib/validations/merma'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const { data, error, count } = await supabaseAdmin
        .from('mermas')
        .select('*, insumo:insumos(id,nombre,sku), unidad:unidades_medida(id,nombre,simbolo)', { count: 'exact' })
        .eq('cedis_id', cedisId)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch mermas', 500)
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
      const parsed = createMermaSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { insumo_id, cantidad, unidad_id, motivo } = parsed.data

      // Validate insumo belongs to cedis
      const { data: insumo } = await supabaseAdmin
        .from('insumos')
        .select('id, stock_minimo, unidad_id')
        .eq('id', insumo_id)
        .eq('cedis_id', cedisId)
        .single()

      if (!insumo) return err('VALIDATION_ERROR', 'Insumo not found in this CEDIS', 400)

      // Validate unit
      const { data: unidad } = await supabaseAdmin
        .from('unidades_medida')
        .select('id, factor')
        .eq('id', unidad_id)
        .single()

      if (!unidad) return err('VALIDATION_ERROR', 'Unidad de medida not found', 400)

      const deltaBase = toBaseUnits(cantidad, Number(unidad.factor))
      const { antes, despues } = await updateInsumoStock(insumo_id, -deltaBase)

      const { data: merma, error: mermaErr } = await supabaseAdmin
        .from('mermas')
        .insert({
          cedis_id: cedisId,
          insumo_id,
          unidad_id,
          cantidad,
          motivo,
          usuario_id: userId,
        })
        .select()
        .single()

      if (mermaErr) return err('DB_ERROR', 'Failed to register merma', 500)

      await insertKardexEntry({
        cedis_id: cedisId,
        insumo_id,
        tipo: 'merma',
        cantidad: -deltaBase,
        unidad_id,
        stock_antes: antes,
        stock_despues: despues,
        referencia_tipo: 'merma',
        referencia_id: merma.id,
        usuario_id: userId,
        notas: motivo,
      })

      const memberIds = await getCedisMemberIds(cedisId)
      await checkAndNotifyLowStock(cedisId, insumo_id, despues, Number(insumo.stock_minimo), memberIds)

      await logAction(cedisId, userId, 'create', 'merma', merma.id, null, { insumo_id, cantidad, motivo })
      return ok(merma, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
