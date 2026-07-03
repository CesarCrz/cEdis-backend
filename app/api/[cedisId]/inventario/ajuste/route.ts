import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry } from '@/lib/services/kardex.service'
import { checkAndNotifyLowStock, getCedisMemberIds } from '@/lib/services/stock-alert.service'
import { ajusteInventarioSchema } from '@/lib/validations/inventario'

type Params = { params: Promise<{ cedisId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = ajusteInventarioSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { insumo_id, cliente_id, cantidad_nueva, motivo } = parsed.data

      // Validate insumo belongs to cedis
      const { data: insumo } = await supabaseAdmin
        .from('insumos')
        .select('id, stock_actual, stock_minimo, unidad_id')
        .eq('id', insumo_id)
        .eq('cedis_id', cedisId)
        .single()

      if (!insumo) return err('VALIDATION_ERROR', 'Insumo not found in this CEDIS', 400)

      const cantidadAnterior = Number(insumo.stock_actual)

      if (cliente_id === null || cliente_id === undefined) {
        // CEDIS inventory adjustment: update insumos.stock_actual directly
        await supabaseAdmin
          .from('insumos')
          .update({ stock_actual: cantidad_nueva, updated_at: new Date().toISOString() })
          .eq('id', insumo_id)
      }
      // For sucursal adjustments, we only record in inventario_ajustes (no stock_actual change)

      // Insert inventario_ajustes record
      const { data: ajuste, error: ajErr } = await supabaseAdmin
        .from('inventario_ajustes')
        .insert({
          cedis_id: cedisId,
          insumo_id,
          unidad_id: insumo.unidad_id,
          cantidad_anterior: cantidadAnterior,
          cantidad_nueva,
          motivo,
          usuario_id: userId,
        })
        .select()
        .single()

      if (ajErr) return err('DB_ERROR', 'Failed to create inventario ajuste', 500)

      // Insert kardex entry
      await insertKardexEntry({
        cedis_id: cedisId,
        insumo_id,
        tipo: 'ajuste_manual',
        cantidad: cantidad_nueva - cantidadAnterior,
        unidad_id: insumo.unidad_id,
        stock_antes: cantidadAnterior,
        stock_despues: cantidad_nueva,
        referencia_tipo: 'inventario_ajuste',
        referencia_id: ajuste.id,
        cliente_id: cliente_id ?? null,
        usuario_id: userId,
        notas: motivo,
      })

      // Check low stock if stock decreased
      if (cantidad_nueva < cantidadAnterior && !cliente_id) {
        const memberIds = await getCedisMemberIds(cedisId)
        await checkAndNotifyLowStock(cedisId, insumo_id, cantidad_nueva, Number(insumo.stock_minimo), memberIds)
      }

      await logAction(cedisId, userId, 'ajuste', 'inventario', insumo_id, { stock_actual: cantidadAnterior }, { stock_actual: cantidad_nueva, motivo })
      return ok(ajuste, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
