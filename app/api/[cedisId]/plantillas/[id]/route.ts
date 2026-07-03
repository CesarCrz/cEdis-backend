import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updatePlantillaSchema } from '@/lib/validations/plantilla'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data, error } = await supabaseAdmin
        .from('plantillas_pedido')
        .select('*, cliente:clientes(id,nombre), items:plantilla_items(id,insumo_id,unidad_id,cantidad,insumo:insumos(id,nombre,sku),unidad:unidades_medida(id,nombre,simbolo))')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (error || !data) return err('NOT_FOUND', 'Plantilla not found', 404)
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
      const parsed = updatePlantillaSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { data: before, error: fetchErr } = await supabaseAdmin
        .from('plantillas_pedido')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !before) return err('NOT_FOUND', 'Plantilla not found', 404)

      const { items, ...plantillaFields } = parsed.data

      // Update scalar fields
      if (Object.keys(plantillaFields).length > 0) {
        const { error: upErr } = await supabaseAdmin
          .from('plantillas_pedido')
          .update(plantillaFields)
          .eq('cedis_id', cedisId)
          .eq('id', id)
        if (upErr) return err('DB_ERROR', 'Failed to update plantilla', 500)
      }

      // Replace items if provided
      if (items !== undefined) {
        await supabaseAdmin.from('plantilla_items').delete().eq('plantilla_id', id)

        if (items.length > 0) {
          const { error: itemsErr } = await supabaseAdmin
            .from('plantilla_items')
            .insert(
              items.map((item) => ({
                plantilla_id: id,
                insumo_id: item.insumo_id,
                unidad_id: item.unidad_id,
                cantidad: item.cantidad,
              }))
            )
          if (itemsErr) return err('DB_ERROR', 'Failed to update plantilla items', 500)
        }
      }

      const { data: updated } = await supabaseAdmin
        .from('plantillas_pedido')
        .select('*')
        .eq('id', id)
        .single()

      await logAction(cedisId, userId, 'update', 'plantilla', id, before, parsed.data)
      return ok(updated)
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

      const { data: plantilla, error: fetchErr } = await supabaseAdmin
        .from('plantillas_pedido')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !plantilla) return err('NOT_FOUND', 'Plantilla not found', 404)

      // Soft delete
      const { error } = await supabaseAdmin
        .from('plantillas_pedido')
        .update({ activa: false })
        .eq('cedis_id', cedisId)
        .eq('id', id)

      if (error) return err('DB_ERROR', 'Failed to deactivate plantilla', 500)

      await logAction(cedisId, userId, 'deactivate', 'plantilla', id)
      return ok({ deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
