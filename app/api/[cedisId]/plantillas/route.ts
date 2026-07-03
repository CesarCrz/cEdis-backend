import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createPlantillaSchema } from '@/lib/validations/plantilla'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)
      const clienteId = sp.get('cliente_id')

      let query = supabaseAdmin
        .from('plantillas_pedido')
        .select('*, cliente:clientes(id,nombre)', { count: 'exact' })
        .eq('cedis_id', cedisId)
        .eq('activa', true)

      if (clienteId) {
        query = query.eq('cliente_id', clienteId)
      }

      const { data, error, count } = await query
        .order('nombre')
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch plantillas', 500)

      return paginated(data ?? [], { total: count ?? 0, page, limit })
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
      const parsed = createPlantillaSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      // Verify cliente belongs to this cedis
      const { data: cliente, error: clienteErr } = await supabaseAdmin
        .from('clientes')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', parsed.data.cliente_id)
        .single()

      if (clienteErr || !cliente) {
        return err('NOT_FOUND', 'Cliente not found', 404)
      }

      const { data: plantilla, error: plantillaErr } = await supabaseAdmin
        .from('plantillas_pedido')
        .insert({
          cedis_id: cedisId,
          cliente_id: parsed.data.cliente_id,
          nombre: parsed.data.nombre,
        })
        .select()
        .single()

      if (plantillaErr || !plantilla) {
        return err('DB_ERROR', 'Failed to create plantilla', 500)
      }

      // Insert items
      const itemRows = parsed.data.items.map((item) => ({
        plantilla_id: plantilla.id,
        insumo_id: item.insumo_id,
        unidad_id: item.unidad_id,
        cantidad: item.cantidad,
      }))

      const { error: itemsErr } = await supabaseAdmin
        .from('plantilla_items')
        .insert(itemRows)

      if (itemsErr) {
        // Rollback plantilla
        await supabaseAdmin.from('plantillas_pedido').delete().eq('id', plantilla.id)
        return err('DB_ERROR', 'Failed to create plantilla items', 500)
      }

      await logAction(cedisId, userId, 'create', 'plantilla', plantilla.id, null, plantilla)
      return ok(plantilla, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
