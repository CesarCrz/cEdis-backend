import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry } from '@/lib/services/kardex.service'
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
        .select('*, cliente:clientes(id,nombre), canal:canales_venta(id,nombre), items:venta_declarada_items(id,receta_id,cantidad_vendida)', { count: 'exact' })
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

      // Recursively flatten a recipe into {insumo_id → consumption in base units (g/mL)}
      // multiplierBase = how many base-units of this recipe are needed
      // rendimientoBase = how many base-units this recipe produces per batch
      async function flattenConsumptions(
        recetaId: string,
        multiplierBase: number,
        rendimientoBase: number,
        visited: Set<string> = new Set()
      ): Promise<Map<string, number>> {
        const result = new Map<string, number>()
        if (visited.has(recetaId) || rendimientoBase === 0) return result
        visited.add(recetaId)

        const { data: ingredientes } = await supabaseAdmin
          .from('receta_ingredientes')
          .select(`
            insumo_id, sub_receta_id, cantidad,
            unidad:unidades_medida(id,factor),
            sub_receta:recetas!receta_ingredientes_sub_receta_id_fkey(id, rendimiento, rendimiento_unidad_id,
              rendimiento_unidad:unidades_medida!recetas_rendimiento_unidad_id_fkey(id,factor))
          `)
          .eq('receta_id', recetaId)

        const batchMultiplier = multiplierBase / rendimientoBase

        for (const ing of (ingredientes ?? [])) {
          const ingFactor = Number((ing.unidad as unknown as { factor: number } | null)?.factor ?? 1)
          const cantBase = Number(ing.cantidad) * ingFactor * batchMultiplier

          if (ing.insumo_id) {
            result.set(ing.insumo_id, (result.get(ing.insumo_id) ?? 0) + cantBase)
          } else if (ing.sub_receta_id) {
            const sub = ing.sub_receta as unknown as {
              id: string
              rendimiento: number
              rendimiento_unidad: { factor: number } | null
            } | null
            if (!sub) continue
            const subRendFactor = Number(sub.rendimiento_unidad?.factor ?? 1)
            const subRendBase = Number(sub.rendimiento) * subRendFactor
            const subMap = await flattenConsumptions(sub.id, cantBase, subRendBase, new Set(visited))
            for (const [insumoId, val] of subMap) {
              result.set(insumoId, (result.get(insumoId) ?? 0) + val)
            }
          }
        }

        return result
      }

      const ventaItems: Array<{
        venta_declarada_id: string
        receta_id: string
        variacion_id: string | null
        cantidad_vendida: number
      }> = []

      // Process each item: calculate theoretical consumption and insert kardex
      for (const item of items) {
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

        // Flatten all insumo consumptions including sub-recipes
        // Top-level: rendimientoBase=1 because cantidad_vendida IS the unit count
        const consumptionMap = await flattenConsumptions(
          item.receta_id,
          item.cantidad_vendida * variacionFactor,
          1
        )

        // Batch-fetch all affected insumos for stock + unit info
        const insumoIds = [...consumptionMap.keys()]
        const { data: insumos } = await supabaseAdmin
          .from('insumos')
          .select('id, stock_actual, unidad_id, unidad:unidades_medida(id,factor)')
          .in('id', insumoIds)

        const insumoMap = new Map(
          (insumos ?? []).map((ins) => [ins.id, ins])
        )

        for (const [insumoId, cantBase] of consumptionMap) {
          const insumo = insumoMap.get(insumoId)
          if (!insumo) continue

          const insumoFactor = Number((insumo.unidad as unknown as { factor: number } | null)?.factor ?? 1)
          const consumoEnUnidad = insumoFactor > 0 ? cantBase / insumoFactor : cantBase

          const stockAntes = Number(insumo.stock_actual ?? 0)

          await insertKardexEntry({
            cedis_id: cedisId,
            insumo_id: insumoId,
            tipo: 'venta_declarada',
            cantidad: -consumoEnUnidad,
            unidad_id: insumo.unidad_id,
            stock_antes: stockAntes,
            stock_despues: stockAntes, // theoretical only, no stock update
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
