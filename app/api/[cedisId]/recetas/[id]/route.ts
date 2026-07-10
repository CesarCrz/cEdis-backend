import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { updateRecetaSchema } from '@/lib/validations/receta'
import { calcularCostoReceta, syncLinkedInsumo } from '@/lib/utils/receta-cost'
import { wouldCreateCircle } from '@/lib/utils/receta-validation'

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

      // Fetch ingredientes with insumo + sub_receta + unidad info
      const { data: ingredientes } = await supabaseAdmin
        .from('receta_ingredientes')
        .select(`
          id, insumo_id, sub_receta_id, cantidad, unidad_id,
          insumo:insumos(id,nombre,costo_unitario,unidad_id),
          sub_receta:recetas!receta_ingredientes_sub_receta_id_fkey(id,nombre,rendimiento,rendimiento_unidad_id),
          unidad:unidades_medida(id,nombre,simbolo,factor)
        `)
        .eq('receta_id', id)

      // Use recursive cost utility
      const costoBase = await calcularCostoReceta(id)

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

      const { nombre, categoria_id, rendimiento, rendimiento_unidad_id, variaciones, ingredientes } = parsed.data

      // Build receta update patch
      const recetaPatch: Record<string, unknown> = {}
      if (nombre !== undefined) recetaPatch.nombre = nombre
      if (categoria_id !== undefined) recetaPatch.categoria_id = categoria_id
      if (rendimiento !== undefined) recetaPatch.rendimiento = rendimiento
      if (rendimiento_unidad_id !== undefined) recetaPatch.rendimiento_unidad_id = rendimiento_unidad_id

      if (Object.keys(recetaPatch).length > 0) {
        const { error: upErr } = await supabaseAdmin
          .from('recetas')
          .update(recetaPatch)
          .eq('cedis_id', cedisId)
          .eq('id', id)
        if (upErr) return err('DB_ERROR', 'Failed to update receta', 500)
      }

      function buildIngRow(ing: { insumo_id?: string | null; sub_receta_id?: string | null; unidad_id: string; cantidad: number }) {
        return {
          receta_id: id,
          insumo_id: ing.insumo_id ?? null,
          sub_receta_id: ing.sub_receta_id ?? null,
          unidad_id: ing.unidad_id,
          cantidad: ing.cantidad,
        }
      }

      // Validate ingredientes before writing
      const allIngs = variaciones
        ? variaciones.flatMap(v => v.ingredientes ?? [])
        : (ingredientes ?? [])

      if (allIngs.length > 0) {
        // Reject duplicates
        const ingKeys = allIngs.map(i => i.insumo_id ?? i.sub_receta_id ?? '')
        if (new Set(ingKeys).size !== ingKeys.length) {
          return err('VALIDATION_ERROR', 'Ingrediente duplicado en la receta', 400)
        }

        // Reject circular sub-receta references
        const subRecetaIds = allIngs.map(i => i.sub_receta_id).filter(Boolean) as string[]
        for (const srId of subRecetaIds) {
          if (await wouldCreateCircle(id, srId)) {
            return err('CONFLICT', 'Referencia circular detectada en sub-recetas', 409)
          }
        }
      }

      // Atomically replace variaciones + ingredientes if provided
      if (variaciones !== undefined) {
        await supabaseAdmin.from('receta_variaciones').delete().eq('receta_id', id)
        await supabaseAdmin.from('receta_ingredientes').delete().eq('receta_id', id)

        for (const variacion of variaciones) {
          await supabaseAdmin.from('receta_variaciones').insert({
            receta_id: id,
            nombre: variacion.nombre,
            factor: 1,
            activa: true,
          })
        }

        // Deduplicate ingredientes across variaciones by insumo_id or sub_receta_id
        const ingMap = new Map<string, ReturnType<typeof buildIngRow>>()
        for (const v of variaciones) {
          for (const ing of v.ingredientes ?? []) {
            const key = ing.insumo_id ?? ing.sub_receta_id ?? ''
            ingMap.set(key, buildIngRow(ing))
          }
        }

        if (ingMap.size > 0) {
          await supabaseAdmin.from('receta_ingredientes').insert([...ingMap.values()])
        }
      } else if (ingredientes !== undefined) {
        await supabaseAdmin.from('receta_ingredientes').delete().eq('receta_id', id)
        if (ingredientes.length > 0) {
          await supabaseAdmin.from('receta_ingredientes').insert(ingredientes.map(buildIngRow))
        }
      }

      // Calculate and persist cost
      const costoBase = await calcularCostoReceta(id)
      await supabaseAdmin.from('recetas').update({ costo_teorico_base: costoBase }).eq('id', id)

      // Auto-sync cost to any linked semi-elaborado insumo
      await syncLinkedInsumo(id, cedisId)

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
