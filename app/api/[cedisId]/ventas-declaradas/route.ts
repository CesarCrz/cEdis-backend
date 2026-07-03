import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry } from '@/lib/services/kardex.service'
import { toBaseUnits } from '@/lib/utils/unit-conversion'
import { createVentaDeclaradaSchema } from '@/lib/validations/venta-declarada'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const clienteId = sp.get('cliente_id')
      const canalId = sp.get('canal_id')
      const periodoInicio = sp.get('periodo_inicio')
      const periodoFin = sp.get('periodo_fin')

      let query = supabaseAdmin
        .from('ventas_declaradas')
        .select('*, cliente:clientes(id,nombre), canal:canales_venta(id,nombre)', { count: 'exact' })
        .eq('cedis_id', cedisId)

      if (clienteId) query = query.eq('cliente_id', clienteId)
      if (canalId) query = query.eq('canal_id', canalId)
      if (periodoInicio) query = query.gte('fecha', periodoInicio)
      if (periodoFin) query = query.lte('fecha', periodoFin)

      const { data, error, count } = await query
        .order('fecha', { ascending: false })
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch ventas declaradas', 500)
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
      const parsed = createVentaDeclaradaSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { cliente_id, canal_id, periodo_inicio, periodo_fin, notas, items } = parsed.data

      // Validate cliente and canal belong to cedis
      const [{ data: cliente }, { data: canal }] = await Promise.all([
        supabaseAdmin.from('clientes').select('id').eq('id', cliente_id).eq('cedis_id', cedisId).single(),
        supabaseAdmin.from('canales_venta').select('id').eq('id', canal_id).eq('cedis_id', cedisId).single(),
      ])

      if (!cliente) return err('VALIDATION_ERROR', 'Cliente not found in this CEDIS', 400)
      if (!canal) return err('VALIDATION_ERROR', 'Canal de venta not found in this CEDIS', 400)

      // Use periodo_inicio as the fecha for unique constraint
      const { data: venta, error: ventaErr } = await supabaseAdmin
        .from('ventas_declaradas')
        .insert({
          cedis_id: cedisId,
          cliente_id,
          canal_id,
          fecha: periodo_inicio,
          usuario_id: userId,
          notas: notas ?? null,
        })
        .select()
        .single()

      if (ventaErr) {
        if (ventaErr.code === '23505') return err('CONFLICT', 'Ya existe una venta declarada para este cliente/canal/fecha', 409)
        return err('DB_ERROR', 'Failed to create venta declarada', 500)
      }

      const ventaItems: Array<{
        venta_declarada_id: string
        receta_id: string
        variacion_id: string | null
        cantidad_vendida: number
      }> = []

      // Process each item: calculate theoretical consumption and insert kardex
      for (const item of items) {
        // Get recipe ingredients with their units
        let ingredientesQuery = supabaseAdmin
          .from('receta_ingredientes')
          .select('insumo_id, cantidad, unidad:unidades_medida(id,factor,simbolo)')
          .eq('receta_id', item.receta_id)

        const { data: ingredientes } = await ingredientesQuery

        // Get variation factor if provided
        let variacionFactor = 1
        if (item.variacion_id) {
          const { data: variacion } = await supabaseAdmin
            .from('receta_variaciones')
            .select('factor')
            .eq('id', item.variacion_id)
            .single()
          variacionFactor = Number(variacion?.factor ?? 1)
        }

        for (const ingrediente of (ingredientes ?? [])) {
          const factor = Number((ingrediente.unidad as unknown as { factor: number } | null)?.factor ?? 1)
          const cantidadBase = toBaseUnits(Number(ingrediente.cantidad), factor)
          const consumoBase = cantidadBase * variacionFactor * item.cantidad_vendida

          // Get current insumo stock for before/after
          const { data: insumo } = await supabaseAdmin
            .from('insumos')
            .select('stock_actual, unidad_id')
            .eq('id', ingrediente.insumo_id)
            .single()

          const stockAntes = Number(insumo?.stock_actual ?? 0)
          const unidadId = insumo?.unidad_id ?? (ingrediente.unidad as unknown as { id: string } | null)?.id ?? ''

          // venta_declarada does NOT update insumos.stock_actual (theoretical only)
          await insertKardexEntry({
            cedis_id: cedisId,
            insumo_id: ingrediente.insumo_id,
            tipo: 'venta_declarada',
            cantidad: -consumoBase,
            unidad_id: unidadId,
            stock_antes: stockAntes,
            stock_despues: stockAntes, // no actual change
            referencia_tipo: 'venta_declarada',
            referencia_id: venta.id,
            cliente_id,
            canal_id,
            usuario_id: userId,
            notas: `Venta declarada ${periodo_inicio} - ${periodo_fin}`,
          })
        }

        ventaItems.push({
          venta_declarada_id: venta.id,
          receta_id: item.receta_id,
          variacion_id: item.variacion_id ?? null,
          cantidad_vendida: item.cantidad_vendida,
        })
      }

      if (ventaItems.length > 0) {
        await supabaseAdmin.from('venta_declarada_items').insert(ventaItems)
      }

      await logAction(cedisId, userId, 'create', 'venta_declarada', venta.id, null, {
        cliente_id,
        canal_id,
        periodo_inicio,
        periodo_fin,
      })

      return ok({ ...venta, items: ventaItems, periodo_fin }, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
