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

  const { data, error } = await supabaseAdmin
    .from('cedis')
    .select(`
      id, nombre, descripcion, created_at, updated_at, owner_id,
      cedis_members!inner(role)
    `)
    .or(`owner_id.eq.${auth.userId},cedis_members.user_id.eq.${auth.userId}`)
    .order('created_at', { ascending: false })

  if (error) {
    return err('DB_ERROR', 'Failed to fetch CEDIS list', 500)
  }

  return ok(data)
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
