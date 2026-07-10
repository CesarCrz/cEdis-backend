import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateEntradaSchema } from '@/lib/validations/entrada'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data: entrada, error } = await supabaseAdmin
        .from('entradas')
        .select('*, proveedor:proveedores(id,nombre), items:entrada_items(*, insumo:insumos(id,nombre,sku), unidad:unidades_medida(id,nombre,simbolo))')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (error || !entrada) return err('NOT_FOUND', 'Entrada not found', 404)
      return ok(entrada)
    })
  )
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: existing } = await supabaseAdmin
        .from('entradas')
        .select('id, status')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (!existing) return err('NOT_FOUND', 'Entrada not found', 404)
      if (existing.status !== 'draft') return err('CONFLICT', 'Only draft entradas can be updated', 409)

      const body = await req.json().catch(() => null)
      const parsed = updateEntradaSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { items, ...fields } = parsed.data
      const updateFields: Record<string, unknown> = {}
      if ('proveedor_id' in parsed.data) updateFields.proveedor_id = fields.proveedor_id ?? null
      if ('notas' in parsed.data) updateFields.notas = fields.notas ?? null

      if (Object.keys(updateFields).length > 0) {
        await supabaseAdmin.from('entradas').update(updateFields).eq('id', id)
      }

      if (items) {
        // Reject duplicate insumos
        const insumoIds = items.map(i => i.insumo_id)
        if (new Set(insumoIds).size !== insumoIds.length) {
          return err('VALIDATION_ERROR', 'No se puede agregar el mismo insumo dos veces en una entrada', 400)
        }

        // Validate insumos belong to cedis
        const { data: insumos } = await supabaseAdmin
          .from('insumos')
          .select('id')
          .eq('cedis_id', cedisId)
          .in('id', insumoIds)

        if ((insumos?.length ?? 0) < insumoIds.length) {
          return err('VALIDATION_ERROR', 'One or more insumos not found in this CEDIS', 400)
        }

        const total_costo = items.reduce((sum, item) => sum + item.cantidad * item.costo_unitario, 0)

        // Replace items atomically
        await supabaseAdmin.from('entrada_items').delete().eq('entrada_id', id)
        await supabaseAdmin.from('entrada_items').insert(
          items.map(item => ({
            entrada_id: id,
            insumo_id: item.insumo_id,
            unidad_id: item.unidad_id,
            cantidad: item.cantidad,
            costo_unitario: item.costo_unitario,
          }))
        )
        await supabaseAdmin.from('entradas').update({ total_costo }).eq('id', id)
      }

      const { data: updated } = await supabaseAdmin
        .from('entradas')
        .select('*, items:entrada_items(*)')
        .eq('id', id)
        .single()

      await logAction(cedisId, userId, 'update', 'entrada', id, existing, updated)
      return ok(updated)
    })
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: existing } = await supabaseAdmin
        .from('entradas')
        .select('id, status, folio')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (!existing) return err('NOT_FOUND', 'Entrada not found', 404)
      if (existing.status !== 'draft') return err('CONFLICT', 'Only draft entradas can be cancelled', 409)

      await supabaseAdmin.from('entradas').update({ status: 'cancelled' }).eq('id', id)
      await logAction(cedisId, userId, 'cancel', 'entrada', id, existing, { status: 'cancelled' })
      return ok({ id, status: 'cancelled' })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
