import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { z } from 'zod'

const schema = z.object({ nombre: z.string().min(1).max(100) })

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const { data, error } = await supabaseAdmin
        .from('receta_categorias')
        .select('*')
        .eq('cedis_id', cedisId)
        .order('nombre')

      if (error) return err('DB_ERROR', 'Failed to fetch receta categories', 500)
      return ok(data ?? [])
    })
  )
}

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = schema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten())

      const { data, error } = await supabaseAdmin
        .from('receta_categorias')
        .insert({ cedis_id: cedisId, nombre: parsed.data.nombre })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') return err('CONFLICT', 'Categoria ya existe', 409)
        return err('DB_ERROR', 'Failed to create receta category', 500)
      }

      await logAction(cedisId, userId, 'create', 'receta_categoria', data.id, null, data)
      return ok(data, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
