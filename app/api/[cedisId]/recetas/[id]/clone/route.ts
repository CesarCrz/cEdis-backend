import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      // Fetch original receta
      const { data: original, error: fetchErr } = await supabaseAdmin
        .from('recetas')
        .select('*')
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .single()

      if (fetchErr || !original) return err('NOT_FOUND', 'Receta not found', 404)

      // Create cloned receta
      const { data: cloned, error: cloneErr } = await supabaseAdmin
        .from('recetas')
        .insert({
          cedis_id: cedisId,
          nombre: `Copia de ${original.nombre}`,
          descripcion: original.descripcion,
          activa: true,
        })
        .select()
        .single()

      if (cloneErr || !cloned) {
        return err('DB_ERROR', 'Failed to clone receta', 500)
      }

      // Clone variaciones
      const { data: variaciones } = await supabaseAdmin
        .from('receta_variaciones')
        .select('nombre, factor, precio, activa')
        .eq('receta_id', id)

      if (variaciones && variaciones.length > 0) {
        await supabaseAdmin.from('receta_variaciones').insert(
          variaciones.map((v) => ({
            receta_id: cloned.id,
            nombre: v.nombre,
            factor: v.factor,
            precio: v.precio,
            activa: v.activa,
          }))
        )
      }

      // Clone ingredientes
      const { data: ingredientes } = await supabaseAdmin
        .from('receta_ingredientes')
        .select('insumo_id, unidad_id, cantidad')
        .eq('receta_id', id)

      if (ingredientes && ingredientes.length > 0) {
        await supabaseAdmin.from('receta_ingredientes').insert(
          ingredientes.map((ing) => ({
            receta_id: cloned.id,
            insumo_id: ing.insumo_id,
            unidad_id: ing.unidad_id,
            cantidad: ing.cantidad,
          }))
        )
      }

      await logAction(cedisId, userId, 'clone', 'receta', cloned.id, { original_id: id }, cloned)
      return ok(cloned, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
