import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/middleware/auth'
import { ok, err } from '@/lib/utils/response'

const createSchema = z.object({
  nombre: z.string().min(1).max(200),
  descripcion: z.string().max(500).optional(),
})

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (auth instanceof Response) return auth

  const SELECT = 'id, nombre, descripcion, created_at, updated_at, owner_id'

  const [ownedResult, membershipsResult] = await Promise.all([
    supabaseAdmin
      .from('cedis')
      .select(SELECT)
      .eq('owner_id', auth.userId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('cedis_members')
      .select('cedis_id, role')
      .eq('user_id', auth.userId)
      .not('accepted_at', 'is', null),
  ])

  if (ownedResult.error) {
    console.error('[GET /api/cedis] owned query error:', ownedResult.error.message)
    return err('DB_ERROR', 'Failed to fetch CEDIS list', 500)
  }

  const membershipMap = new Map(
    (membershipsResult.data ?? []).map((m) => [m.cedis_id, m.role as string])
  )
  const memberCedisIds = [...membershipMap.keys()]
  let memberCedis: typeof ownedResult.data = []

  if (memberCedisIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('cedis')
      .select(SELECT)
      .in('id', memberCedisIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/cedis] member cedis query error:', error.message)
      return err('DB_ERROR', 'Failed to fetch CEDIS list', 500)
    }
    memberCedis = data ?? []
  }

  const seen = new Set<string>()
  const ownedIds = new Set((ownedResult.data ?? []).map((c) => c.id))

  const merged = [...(ownedResult.data ?? []), ...memberCedis]
    .filter((c) => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })
    .map((c) => ({
      ...c,
      my_role: ownedIds.has(c.id) ? 'owner' : (membershipMap.get(c.id) ?? 'viewer'),
    }))

  return ok(merged)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())
  }

  const { data, error } = await supabaseAdmin
    .from('cedis')
    .insert({
      owner_id: auth.userId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion ?? null,
    })
    .select()
    .single()

  if (error) {
    return err('DB_ERROR', 'Failed to create CEDIS', 500)
  }

  return ok(data, 201)
}
