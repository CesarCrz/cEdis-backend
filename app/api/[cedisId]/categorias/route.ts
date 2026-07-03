import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createCategoriaSchema } from '@/lib/validations/categoria'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)

      const { data, error, count } = await supabaseAdmin
        .from('categorias')
        .select('*', { count: 'exact' })
        .eq('cedis_id', cedisId)
        .order('nombre')
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch categories', 500)

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
      const parsed = createCategoriaSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      const { data, error } = await supabaseAdmin
        .from('categorias')
        .insert({ cedis_id: cedisId, nombre: parsed.data.nombre })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return err('CONFLICT', 'A category with this name already exists', 409)
        }
        return err('DB_ERROR', 'Failed to create category', 500)
      }

      await logAction(cedisId, userId, 'create', 'categoria', data.id, null, data)
      return ok(data, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
