import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data: venta, error } = await supabaseAdmin
        .from('ventas_declaradas')
        .select(`
          *,
          cliente:clientes(id,nombre),
          canal:canales_venta(id,nombre),
          items:venta_declarada_items(
            *,
            receta:recetas(id,nombre),
            variacion:receta_variaciones(id,nombre,factor)
          )
        `)
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (error || !venta) return err('NOT_FOUND', 'Venta declarada not found', 404)

      // Calculate consumo per insumo from kardex
      const { data: kardexEntries } = await supabaseAdmin
        .from('kardex')
        .select('insumo_id, cantidad, insumo:insumos(id,nombre,sku)')
        .eq('referencia_id', id)
        .eq('tipo', 'venta_declarada')

      const consumoPorInsumo: Record<string, { insumo_id: string; nombre: string; consumo_total: number }> = {}
      for (const entry of (kardexEntries ?? [])) {
        const insumoId = entry.insumo_id
        if (!consumoPorInsumo[insumoId]) {
          consumoPorInsumo[insumoId] = {
            insumo_id: insumoId,
            nombre: (entry.insumo as unknown as { nombre: string } | null)?.nombre ?? '',
            consumo_total: 0,
          }
        }
        consumoPorInsumo[insumoId].consumo_total += Math.abs(Number(entry.cantidad))
      }

      return ok({ ...venta, consumo_calculado: Object.values(consumoPorInsumo) })
    })
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: existing } = await supabaseAdmin
        .from('ventas_declaradas')
        .select('id, fecha, cliente_id, canal_id')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (!existing) return err('NOT_FOUND', 'Venta declarada not found', 404)

      // Delete kardex entries for this declaration
      await supabaseAdmin
        .from('kardex')
        .delete()
        .eq('referencia_id', id)
        .eq('tipo', 'venta_declarada')

      // Delete the venta declarada (cascades to venta_declarada_items)
      await supabaseAdmin.from('ventas_declaradas').delete().eq('id', id)

      await logAction(cedisId, userId, 'delete', 'venta_declarada', id, existing, null)
      return ok({ id, deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
