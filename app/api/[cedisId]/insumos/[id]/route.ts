import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateInsumoSchema } from '@/lib/validations/insumo'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data, error } = await supabaseAdmin
        .from('insumos')
        .select('*, categoria:categorias(id,nombre), proveedor:proveedores(id,nombre), unidad:unidades_medida(id,nombre,simbolo,factor), price_history:insumo_price_history(id,costo_anterior,costo_nuevo,created_at)')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (error || !data) return err('NOT_FOUND', 'Insumo not found', 404)
      return ok(data)
    })
  )
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      const body = await req.json().catch(() => null)
      const parsed = updateInsumoSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      // Fetch current insumo to verify ownership and get old values
      const { data: before, error: fetchErr } = await supabaseAdmin
        .from('insumos')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !before) return err('NOT_FOUND', 'Insumo not found', 404)

      // If costo_unitario changed, record in price history
      if (
        parsed.data.costo_unitario !== undefined &&
        parsed.data.costo_unitario !== Number(before.costo_unitario)
      ) {
        await supabaseAdmin.from('insumo_price_history').insert({
          insumo_id: id,
          cedis_id: cedisId,
          costo_anterior: before.costo_unitario,
          costo_nuevo: parsed.data.costo_unitario,
          usuario_id: userId,
        })
      }

      const { data, error } = await supabaseAdmin
        .from('insumos')
        .update(parsed.data)
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return err('CONFLICT', 'An insumo with this SKU already exists', 409)
        }
        return err('DB_ERROR', 'Failed to update insumo', 500)
      }

      await logAction(cedisId, userId, 'update', 'insumo', id, before, parsed.data)
      return ok(data)
    })
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      const { data: insumo, error: fetchErr } = await supabaseAdmin
        .from('insumos')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !insumo) return err('NOT_FOUND', 'Insumo not found', 404)

      // Guard: active recetas using this insumo
      const { data: recetasActivas } = await supabaseAdmin
        .from('receta_ingredientes')
        .select('receta_id, receta:recetas!inner(id, nombre, activa)')
        .eq('insumo_id', id)
        .eq('receta:recetas.activa', true)
        .limit(1)

      if (recetasActivas && recetasActivas.length > 0) {
        return err('CONFLICT', 'No se puede desactivar: insumo en uso por recetas activas', 409)
      }

      // Guard: pending tickets (draft or confirmed)
      const { data: ticketsPendientes } = await supabaseAdmin
        .from('ticket_items')
        .select('ticket_id, ticket:tickets_venta!inner(id, status, cedis_id)')
        .eq('insumo_id', id)
        .in('ticket:tickets_venta.status', ['draft', 'confirmed'])
        .eq('ticket:tickets_venta.cedis_id', cedisId)
        .limit(1)

      if (ticketsPendientes && ticketsPendientes.length > 0) {
        return err('CONFLICT', 'No se puede desactivar: insumo en tickets pendientes', 409)
      }

      // Soft delete
      const { error } = await supabaseAdmin
        .from('insumos')
        .update({ activo: false })
        .eq('cedis_id', cedisId)
        .eq('id', id)

      if (error) return err('DB_ERROR', 'Failed to deactivate insumo', 500)

      await logAction(cedisId, userId, 'deactivate', 'insumo', id)
      return ok({ deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
