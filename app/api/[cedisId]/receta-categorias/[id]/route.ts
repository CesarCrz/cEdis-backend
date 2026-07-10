import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { z } from 'zod'

const schema = z.object({ nombre: z.string().min(1).max(100) })

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = schema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten())

      const { data, error } = await supabaseAdmin
        .from('receta_categorias')
        .update({ nombre: parsed.data.nombre })
        .eq('cedis_id', cedisId)
        .eq('id', id)
        .select()
        .single()

      if (error) return err('DB_ERROR', 'Failed to update receta category', 500)
      await logAction(cedisId, userId, 'update', 'receta_categoria', id)
      return ok(data)
    })
  )
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { error } = await supabaseAdmin
        .from('receta_categorias')
        .delete()
        .eq('cedis_id', cedisId)
        .eq('id', id)

      if (error) return err('DB_ERROR', 'Failed to delete receta category', 500)
      await logAction(cedisId, userId, 'delete', 'receta_categoria', id)
      return ok({ deleted: true })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
