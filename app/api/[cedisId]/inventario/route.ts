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
      const tipo = sp.get('tipo') ?? 'all' // 'cedis' | 'sucursal' | 'all'
      const clienteId = sp.get('cliente_id')

      const result: {
        cedis?: unknown[]
        sucursales?: unknown[]
      } = {}

      if (tipo === 'cedis' || tipo === 'all') {
        // CEDIS inventory: directly from insumos.stock_actual
        const { data: insumos, error } = await supabaseAdmin
          .from('insumos')
          .select('id, nombre, sku, stock_actual, stock_minimo, costo_unitario, unidad:unidades_medida(id,simbolo), categoria:categorias(id,nombre)')
          .eq('cedis_id', cedisId)
          .eq('activo', true)
          .order('nombre')

        if (error) return err('DB_ERROR', 'Failed to fetch CEDIS inventory', 500)

        result.cedis = (insumos ?? []).map(insumo => {
          const stock = Number(insumo.stock_actual)
          const min = Number(insumo.stock_minimo)
          let semaforo: string
          if (stock === 0) semaforo = 'critical'
          else if (stock <= min * 0.5) semaforo = 'low'
          else if (stock <= min) semaforo = 'warn'
          else semaforo = 'ok'

          return { ...insumo, semaforo }
        })
      }

      if (tipo === 'sucursal' || tipo === 'all') {
        // Sucursal inventory per insumo per cliente
        // = SUM(ticket_items delivered) - SUM(venta_declarada kardex) - SUM(inventario_ajustes diferencia)

        // Get all clientes for this cedis (or just the requested one)
        let clientesQuery = supabaseAdmin
          .from('clientes')
          .select('id, nombre')
          .eq('cedis_id', cedisId)
          .eq('activo', true)

        if (clienteId) clientesQuery = clientesQuery.eq('id', clienteId)
        const { data: clientes } = await clientesQuery

        const sucursalesData = await Promise.all(
          (clientes ?? []).map(async (cliente) => {
            // Get all delivered tickets for this cliente
            const { data: tickets } = await supabaseAdmin
              .from('tickets_venta')
              .select('id')
              .eq('cedis_id', cedisId)
              .eq('cliente_id', cliente.id)
              .eq('status', 'delivered')

            const ticketIds = (tickets ?? []).map(t => t.id)

            // Sum ticket items (deliveries)
            const ticketItemsMap: Record<string, number> = {}
            if (ticketIds.length > 0) {
              const { data: ticketItems } = await supabaseAdmin
                .from('ticket_items')
                .select('insumo_id, cantidad')
                .in('ticket_id', ticketIds)

              for (const item of (ticketItems ?? [])) {
                ticketItemsMap[item.insumo_id] = (ticketItemsMap[item.insumo_id] ?? 0) + Number(item.cantidad)
              }
            }

            // Sum venta_declarada kardex (theoretical consumption)
            const { data: kdxEntries } = await supabaseAdmin
              .from('kardex')
              .select('insumo_id, cantidad')
              .eq('cedis_id', cedisId)
              .eq('cliente_id', cliente.id)
              .eq('tipo', 'venta_declarada')

            const ventaDeclaradaMap: Record<string, number> = {}
            for (const entry of (kdxEntries ?? [])) {
              ventaDeclaradaMap[entry.insumo_id] = (ventaDeclaradaMap[entry.insumo_id] ?? 0) + Math.abs(Number(entry.cantidad))
            }

            // Sum manual adjustments from kardex (tipo=ajuste_manual with cliente_id)
            const { data: ajusteEntries } = await supabaseAdmin
              .from('kardex')
              .select('insumo_id, cantidad')
              .eq('cedis_id', cedisId)
              .eq('cliente_id', cliente.id)
              .eq('tipo', 'ajuste_manual')

            const ajustesMap: Record<string, number> = {}
            for (const aj of (ajusteEntries ?? [])) {
              ajustesMap[aj.insumo_id] = (ajustesMap[aj.insumo_id] ?? 0) + Number(aj.cantidad)
            }

            // Gather all insumo IDs relevant to this cliente
            const allInsumoIds = new Set([
              ...Object.keys(ticketItemsMap),
              ...Object.keys(ventaDeclaradaMap),
              ...Object.keys(ajustesMap),
            ])

            // Fetch insumo details
            const { data: insumos } = await supabaseAdmin
              .from('insumos')
              .select('id, nombre, sku, unidad:unidades_medida(id,simbolo)')
              .in('id', [...allInsumoIds])

            const items = (insumos ?? []).map(insumo => {
              const entregado = ticketItemsMap[insumo.id] ?? 0
              const consumido = ventaDeclaradaMap[insumo.id] ?? 0
              // ajustesMap holds signed kardex.cantidad values (positive=in, negative=out)
              const ajuste_neto = ajustesMap[insumo.id] ?? 0
              const stock_calculado = entregado - consumido + ajuste_neto
              return {
                insumo_id: insumo.id,
                nombre: insumo.nombre,
                sku: insumo.sku,
                unidad: insumo.unidad,
                entregado,
                consumido,
                ajuste_neto,
                stock_calculado: Math.max(0, stock_calculado),
              }
            })

            return { cliente_id: cliente.id, nombre: cliente.nombre, items }
          })
        )

        result.sucursales = sucursalesData
      }

      return ok(result)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
