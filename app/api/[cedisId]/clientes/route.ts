import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err, paginated } from '@/lib/utils/response'
import { parsePagination } from '@/lib/utils/pagination'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClienteSchema } from '@/lib/validations/cliente'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const sp = req.nextUrl.searchParams
      const { from, to, page, limit } = parsePagination(sp)
      const search = sp.get('search')

      let query = supabaseAdmin
        .from('clientes')
        .select('*', { count: 'exact' })
        .eq('cedis_id', cedisId)
        .eq('activo', true)

      if (search) {
        query = query.ilike('nombre', `%${search}%`)
      }

      const { data, error, count } = await query
        .order('nombre')
        .range(from, to)

      if (error) return err('DB_ERROR', 'Failed to fetch clientes', 500)

      // Enrich with ticket count per cliente
      const clienteIds = (data ?? []).map((c) => c.id)
      let ticketCounts: Record<string, number> = {}

      if (clienteIds.length > 0) {
        const { data: counts } = await supabaseAdmin
          .from('tickets_venta')
          .select('cliente_id')
          .eq('cedis_id', cedisId)
          .in('cliente_id', clienteIds)

        if (counts) {
          for (const t of counts) {
            ticketCounts[t.cliente_id] = (ticketCounts[t.cliente_id] ?? 0) + 1
          }
        }
      }

      const enriched = (data ?? []).map((c) => ({
        ...c,
        tickets_count: ticketCounts[c.id] ?? 0,
      }))

      return paginated(enriched, { total: count ?? 0, page, limit })
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
      const parsed = createClienteSchema.safeParse(body)
      if (!parsed.success) {
        return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
      }

      // Reject duplicate name within same CEDIS
      const { data: existing } = await supabaseAdmin
        .from('clientes')
        .select('id')
        .eq('cedis_id', cedisId)
        .ilike('nombre', parsed.data.nombre)
        .limit(1)
        .maybeSingle()

      if (existing) return err('CONFLICT', 'Ya existe un cliente con ese nombre en este CEDIS', 409)

      const { data, error } = await supabaseAdmin
        .from('clientes')
        .insert({ cedis_id: cedisId, ...parsed.data })
        .select()
        .single()

      if (error) return err('DB_ERROR', 'Failed to create cliente', 500)

      await logAction(cedisId, userId, 'create', 'cliente', data.id, null, data)
      return ok(data, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
