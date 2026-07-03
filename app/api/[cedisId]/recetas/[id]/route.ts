import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateRecetaSchema } from '@/lib/validations/receta'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data: receta, error } = await supabaseAdmin
        .from('recetas')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (error || !receta) return err('NOT_FOUND', 'Receta not found', 404)

      // Fetch variaciones
      const { data: variaciones } = await supabaseAdmin
        .from('receta_variaciones')
        .select('id, nombre, factor, precio, activa')
        .eq('receta_id', id)
        .order('nombre')

      // Fetch ingredientes with insumo + unidad info
      const { data: ingredientes } = await supabaseAdmin
        .from('receta_ingredientes')
        .select('id, insumo_id, cantidad, unidad_id, insumo:insumos(id,nombre,costo_unitario,unidad_id), unidad:unidades_medida(id,nombre,simbolo,factor)')
        .eq('receta_id', id)

      // Calculate costo_teorico per variation (base ingredients × factor)
      let costoBase = 0
      for (const ing of ingredientes ?? []) {
        const insumo = (ing.insumo as unknown) as { costo_unitario: number; unidad_id: string } | null
        const ingUnidad = (ing.unidad as unknown) as { factor: number } | null
        if (!insumo || !ingUnidad) continue

        // Get insumo's own unit factor
        const { data: insumoUnidad } = await supabaseAdmin
          .from('unidades_medida')
          .select('factor')
          .eq('id', insumo.unidad_id)
          .single()

        const fromFactor = Number(ingUnidad.factor)
        const toFactor = Number(insumoUnidad?.factor ?? 1)
        costoBase += (Number(ing.cantidad) * fromFactor / toFactor) * Number(insumo.costo_unitario)
      }

      const variacionesConCosto = (variaciones ?? []).map((v) => ({
        ...v,
        costo_teorico: costoBase * Number(v.factor),
      }))

      return ok({
        ...receta,
        variaciones: variacionesConCosto,
        ingredientes: ingredientes ?? [],
        costo_teorico_base: costoBase,
      })
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
      const parsed = updateRecetaSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { data: before, error: fetchErr } = await supabaseAdmin
        .from('recetas')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !before) return err('NOT_FOUND', 'Receta not found', 404)

      const { nombre, variaciones, ingredientes } = parsed.data

      // Update receta nombre if provided
      if (nombre !== undefined) {
        const { error: upErr } = await supabaseAdmin
          .from('recetas')
          .update({ nombre })
          .eq('cedis_id', cedisId)
          .eq('id', id)
        if (upErr) return err('DB_ERROR', 'Failed to update receta', 500)
      }

      // Atomically replace variaciones + ingredientes if provided
      if (variaciones !== undefined) {
        // Delete existing variaciones (cascades to nothing since ingredientes are at receta level)
        await supabaseAdmin.from('receta_variaciones').delete().eq('receta_id', id)
        // Delete existing ingredientes
        await supabaseAdmin.from('receta_ingredientes').delete().eq('receta_id', id)

        // Re-insert variaciones
        for (const variacion of variaciones) {
          await supabaseAdmin.from('receta_variaciones').insert({
            receta_id: id,
            nombre: variacion.nombre,
            factor: 1,
            activa: true,
          })
        }

        // Collect all unique ingredientes across variaciones
        const ingMap = new Map<string, { insumo_id: string; unidad_id: string; cantidad: number }>()
        for (const v of variaciones) {
          for (const ing of v.ingredientes ?? []) {
            ingMap.set(ing.insumo_id, {
              insumo_id: ing.insumo_id,
              unidad_id: ing.unidad_id,
              cantidad: ing.cantidad,
            })
          }
        }

        if (ingMap.size > 0) {
          await supabaseAdmin.from('receta_ingredientes').insert(
            [...ingMap.values()].map((ing) => ({ receta_id: id, ...ing }))
          )
        }
      } else if (ingredientes !== undefined) {
        // Replace only ingredients
        await supabaseAdmin.from('receta_ingredientes').delete().eq('receta_id', id)
        if (ingredientes.length > 0) {
          await supabaseAdmin.from('receta_ingredientes').insert(
            ingredientes.map((ing) => ({
              receta_id: id,
              insumo_id: ing.insumo_id,
              unidad_id: ing.unidad_id,
              cantidad: ing.cantidad,
            }))
          )
        }
      }

      const { data: updated } = await supabaseAdmin
        .from('recetas')
        .select('*')
        .eq('id', id)
        .single()

      await logAction(cedisId, userId, 'update', 'receta', id, before, parsed.data)
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

      const { data: receta, error: fetchErr } = await supabaseAdmin
        .from('recetas')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !receta) return err('NOT_FOUND', 'Receta not found', 404)

      // Soft delete
      const { error } = await supabaseAdmin
        .from('recetas')
        .update({ activa: false })
        .eq('cedis_id', cedisId)
        .eq('id', id)

      if (error) return err('DB_ERROR', 'Failed to deactivate receta', 500)

      await logAction(cedisId, userId, 'deactivate', 'receta', id)
      return ok({ deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
