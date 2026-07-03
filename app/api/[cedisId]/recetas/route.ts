import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createRecetaSchema } from '@/lib/validations/receta'

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
        .select('*, variaciones:receta_variaciones(id,nombre,factor,precio,activa)', { count: 'exact' })
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

      const { nombre, variaciones, ingredientes } = parsed.data

      // Insert receta
      const { data: receta, error: recetaErr } = await supabaseAdmin
        .from('recetas')
        .insert({ cedis_id: cedisId, nombre })
        .select()
        .single()

      if (recetaErr || !receta) {
        return err('DB_ERROR', 'Failed to create receta', 500)
      }

      // Determine which ingredients to insert
      if (variaciones && variaciones.length > 0) {
        // Insert variations
        for (const variacion of variaciones) {
          const { data: vData, error: vErr } = await supabaseAdmin
            .from('receta_variaciones')
            .insert({
              receta_id: receta.id,
              nombre: variacion.nombre,
              factor: 1,
              activa: true,
            })
            .select()
            .single()

          if (vErr || !vData) continue

          // Insert ingredients for each variation (stored at recipe level, deduped)
          if (variacion.ingredientes?.length) {
            const ingRows = variacion.ingredientes.map((ing) => ({
              receta_id: receta.id,
              insumo_id: ing.insumo_id,
              unidad_id: ing.unidad_id,
              cantidad: ing.cantidad,
            }))

            await supabaseAdmin
              .from('receta_ingredientes')
              .upsert(ingRows, { onConflict: 'receta_id,insumo_id' })
          }
        }
      } else {
        // No variations provided — create a default "Normal" variation
        await supabaseAdmin.from('receta_variaciones').insert({
          receta_id: receta.id,
          nombre: 'Normal',
          factor: 1,
          activa: true,
        })

        // Insert top-level ingredientes
        if (ingredientes && ingredientes.length > 0) {
          const ingRows = ingredientes.map((ing) => ({
            receta_id: receta.id,
            insumo_id: ing.insumo_id,
            unidad_id: ing.unidad_id,
            cantidad: ing.cantidad,
          }))

          await supabaseAdmin.from('receta_ingredientes').insert(ingRows)
        }
      }

      await logAction(cedisId, userId, 'create', 'receta', receta.id, null, receta)
      return ok(receta, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
