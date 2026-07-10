import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createRecetaSchema } from '@/lib/validations/receta'
import { calcularCostoReceta, syncLinkedInsumo } from '@/lib/utils/receta-cost'
import { wouldCreateCircle } from '@/lib/utils/receta-validation'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)
      const search = sp.get('search')

      let query = supabaseAdmin
        .from('recetas')
        .select('*, categoria:receta_categorias(id,nombre), rendimiento_unidad:unidades_medida!recetas_rendimiento_unidad_id_fkey(id,simbolo), variaciones:receta_variaciones(id,nombre,factor,precio,activa)', { count: 'exact' })
        .eq('cedis_id', cedisId)
        .eq('activa', true)

      if (search) {
        query = query.ilike('nombre', `%${search}%`)
      }

      const { data, error, count } = await query
        .order('nombre')
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch recetas', 500)

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
      const parsed = createRecetaSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { nombre, categoria_id, rendimiento, rendimiento_unidad_id, variaciones, ingredientes } = parsed.data

      // Insert receta
      const { data: receta, error: recetaErr } = await supabaseAdmin
        .from('recetas')
        .insert({ cedis_id: cedisId, nombre, categoria_id: categoria_id ?? null, rendimiento: rendimiento ?? 1, rendimiento_unidad_id: rendimiento_unidad_id ?? null })
        .select()
        .single()

      if (recetaErr || !receta) {
        return err('DB_ERROR', 'Failed to create receta', 500)
      }

      function buildIngRow(ing: { insumo_id?: string | null; sub_receta_id?: string | null; unidad_id: string; cantidad: number }) {
        return {
          receta_id: receta.id,
          insumo_id: ing.insumo_id ?? null,
          sub_receta_id: ing.sub_receta_id ?? null,
          unidad_id: ing.unidad_id,
          cantidad: ing.cantidad,
        }
      }

      // Collect all ingredientes for validation
      const allIngs = variaciones
        ? variaciones.flatMap(v => v.ingredientes ?? [])
        : (ingredientes ?? [])

      // Reject duplicate insumo/sub_receta in ingredientes
      const ingKeys = allIngs.map(i => i.insumo_id ?? i.sub_receta_id ?? '')
      if (new Set(ingKeys).size !== ingKeys.length) {
        await supabaseAdmin.from('recetas').update({ activa: false }).eq('id', receta.id)
        return err('VALIDATION_ERROR', 'Ingrediente duplicado en la receta', 400)
      }

      // Reject circular sub-receta references
      const subRecetaIds = allIngs.map(i => i.sub_receta_id).filter(Boolean) as string[]
      for (const srId of subRecetaIds) {
        if (await wouldCreateCircle(receta.id, srId)) {
          await supabaseAdmin.from('recetas').update({ activa: false }).eq('id', receta.id)
          return err('CONFLICT', 'Referencia circular detectada en sub-recetas', 409)
        }
      }

      if (variaciones && variaciones.length > 0) {
        for (const variacion of variaciones) {
          await supabaseAdmin.from('receta_variaciones').insert({
            receta_id: receta.id,
            nombre: variacion.nombre,
            factor: 1,
            activa: true,
          })

          if (variacion.ingredientes?.length) {
            await supabaseAdmin.from('receta_ingredientes').insert(
              variacion.ingredientes.map(buildIngRow)
            )
          }
        }
      } else {
        await supabaseAdmin.from('receta_variaciones').insert({
          receta_id: receta.id,
          nombre: 'Normal',
          factor: 1,
          activa: true,
        })

        if (ingredientes && ingredientes.length > 0) {
          await supabaseAdmin.from('receta_ingredientes').insert(
            ingredientes.map(buildIngRow)
          )
        }
      }

      // Calculate and persist cost
      const costoBase = await calcularCostoReceta(receta.id)
      await supabaseAdmin.from('recetas').update({ costo_teorico_base: costoBase }).eq('id', receta.id)

      // Auto-sync cost to any linked semi-elaborado insumo
      await syncLinkedInsumo(receta.id, cedisId)

      await logAction(cedisId, userId, 'create', 'receta', receta.id, null, receta)
      return ok({ ...receta, costo_teorico_base: costoBase }, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
