import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { ok, err } from '@/lib/utils/response'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string }> }

function getPeriodStart(periodo: string): string {
  const now = new Date()
  const days = periodo === '7d' ? 7 : periodo === '90d' ? 90 : 30
  now.setDate(now.getDate() - days)
  return now.toISOString()
}

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const periodo = sp.get('periodo') ?? '30d'
      const periodStart = getPeriodStart(periodo)

      const [
        insumosResult,
        ticketsPendientesResult,
        entradasPeriodoResult,
        faltantesResult,
        ventasPorDiaResult,
        topInsumosResult,
        ventasPorCanalResult,
        actividadResult,
      ] = await Promise.all([
        // Total insumos activos + valor inventario
        supabaseAdmin
          .from('insumos')
          .select('stock_actual, costo_unitario')
          .eq('cedis_id', cedisId)
          .eq('activo', true),

        // Tickets pendientes (draft + confirmed)
        supabaseAdmin
          .from('tickets_venta')
          .select('id', { count: 'exact', head: true })
          .eq('cedis_id', cedisId)
          .in('status', ['draft', 'confirmed']),

        // Entradas confirmed in period
        supabaseAdmin
          .from('entradas')
          .select('id', { count: 'exact', head: true })
          .eq('cedis_id', cedisId)
          .eq('status', 'confirmed')
          .gte('confirmed_at', periodStart),

        // Top 5 faltantes
        supabaseAdmin
          .from('insumos')
          .select('id, nombre, stock_actual, stock_minimo, unidad:unidades_medida(id,simbolo)')
          .eq('cedis_id', cedisId)
          .eq('activo', true)
          .order('nombre'),

        // Delivered tickets per day in period
        supabaseAdmin
          .from('tickets_venta')
          .select('delivered_at')
          .eq('cedis_id', cedisId)
          .eq('status', 'delivered')
          .gte('delivered_at', periodStart)
          .not('delivered_at', 'is', null),

        // Top 10 most sold insumos by quantity in delivered tickets in period
        supabaseAdmin
          .from('ticket_items')
          .select('insumo_id, cantidad, ticket:tickets_venta!inner(cedis_id,status,delivered_at)')
          .eq('ticket.cedis_id', cedisId)
          .eq('ticket.status', 'delivered')
          .gte('ticket.delivered_at', periodStart),

        // Ventas por canal (from ventas_declaradas in period)
        supabaseAdmin
          .from('ventas_declaradas')
          .select('canal:canales_venta(id,nombre), items:venta_declarada_items(cantidad_vendida)')
          .eq('cedis_id', cedisId)
          .gte('created_at', periodStart),

        // Last 10 audit entries with user
        supabaseAdmin
          .from('audit_log')
          .select('*, usuario:profiles(id,full_name)')
          .eq('cedis_id', cedisId)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      // KPIs
      const insumos = insumosResult.data ?? []
      const total_insumos = insumos.length
      const valor_inventario = insumos.reduce((sum, i) => sum + Number(i.stock_actual) * Number(i.costo_unitario), 0)
      const tickets_pendientes = ticketsPendientesResult.count ?? 0
      const entradas_periodo = entradasPeriodoResult.count ?? 0

      // Faltantes preview (top 5)
      const allFaltantes = (faltantesResult.data ?? [])
        .filter(i => Number(i.stock_actual) <= Number(i.stock_minimo))
        .map(i => ({
          ...i,
          faltante: Number(i.stock_minimo) - Number(i.stock_actual),
          semaforo: Number(i.stock_actual) === 0 ? 'critical' : Number(i.stock_actual) <= Number(i.stock_minimo) * 0.5 ? 'low' : 'warn',
        }))
        .sort((a, b) => b.faltante - a.faltante)
        .slice(0, 5)

      // Ventas por dia
      const ventasPorDiaMap: Record<string, number> = {}
      for (const t of (ventasPorDiaResult.data ?? [])) {
        const fecha = (t.delivered_at as string).slice(0, 10)
        ventasPorDiaMap[fecha] = (ventasPorDiaMap[fecha] ?? 0) + 1
      }
      const ventas_por_dia = Object.entries(ventasPorDiaMap)
        .map(([fecha, total]) => ({ fecha, total }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))

      // Top insumos by quantity sold
      const topInsumosMap: Record<string, { nombre: string; cantidad: number }> = {}
      for (const item of (topInsumosResult.data ?? [])) {
        if (!topInsumosMap[item.insumo_id]) {
          topInsumosMap[item.insumo_id] = { nombre: item.insumo_id, cantidad: 0 }
        }
        topInsumosMap[item.insumo_id].cantidad += Number(item.cantidad)
      }

      // Fetch insumo names for top items
      const topIds = Object.keys(topInsumosMap)
      if (topIds.length > 0) {
        const { data: insNombres } = await supabaseAdmin
          .from('insumos')
          .select('id, nombre')
          .in('id', topIds)

        for (const ins of (insNombres ?? [])) {
          if (topInsumosMap[ins.id]) topInsumosMap[ins.id].nombre = ins.nombre
        }
      }

      const top_insumos = Object.values(topInsumosMap)
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10)

      // Ventas por canal
      const ventasCanalMap: Record<string, { canal: string; cantidad: number }> = {}
      for (const vd of (ventasPorCanalResult.data ?? [])) {
        const canalRaw = vd.canal as unknown as { id: string; nombre: string } | null
        if (!canalRaw) continue
        const canalNombre = canalRaw.nombre
        if (!ventasCanalMap[canalRaw.id]) {
          ventasCanalMap[canalRaw.id] = { canal: canalNombre, cantidad: 0 }
        }
        for (const item of ((vd.items as Array<{ cantidad_vendida: number }>) ?? [])) {
          ventasCanalMap[canalRaw.id].cantidad += Number(item.cantidad_vendida)
        }
      }
      const ventas_por_canal = Object.values(ventasCanalMap).sort((a, b) => b.cantidad - a.cantidad)

      return ok({
        kpis: {
          total_insumos,
          valor_inventario,
          tickets_pendientes,
          entradas_periodo,
        },
        faltantes_preview: allFaltantes,
        ventas_por_dia,
        top_insumos,
        ventas_por_canal,
        actividad_reciente: (actividadResult.data ?? []).map((entry) => {
          const u = entry.usuario as { full_name?: string } | null
          return {
            id: entry.id,
            tipo: `${entry.action} ${entry.entity_type}`,
            usuario_nombre: u?.full_name ?? 'Sistema',
            created_at: entry.created_at,
            detalles: entry.new_value ?? entry.old_value,
          }
        }),
      })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
