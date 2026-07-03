import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { err } from '@/lib/utils/response'
import type { AuthContext, UserRole } from '@/types'

async function getUserCedisRole(userId: string, cedisId: string): Promise<UserRole | null> {
  const { data: cedis } = await supabaseAdmin
    .from('cedis')
    .select('owner_id')
    .eq('id', cedisId)
    .single()

  if (!cedis) return null
  if (cedis.owner_id === userId) return 'owner'

  const { data: member } = await supabaseAdmin
    .from('cedis_members')
    .select('role')
    .eq('cedis_id', cedisId)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()

  return (member?.role as UserRole) ?? null
}

export async function withAuth(
  req: NextRequest,
  cedisId: string,
  handler: (ctx: AuthContext) => Promise<Response>
): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return err('UNAUTHORIZED', 'Missing or invalid Authorization header', 401)
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return err('UNAUTHORIZED', 'Invalid or expired token', 401)
  }

  const role = await getUserCedisRole(user.id, cedisId)
  if (!role) {
    // Return 404 to avoid leaking resource existence (IDOR mitigation)
    return err('NOT_FOUND', 'CEDIS not found', 404)
  }

  return handler({ userId: user.id, cedisId, role })
}

// Verify JWT without a cedis context (used for listing/creating cedis)
export async function getAuthUser(req: NextRequest): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return err('UNAUTHORIZED', 'Missing or invalid Authorization header', 401)
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return err('UNAUTHORIZED', 'Invalid or expired token', 401)
  }

  return { userId: user.id }
}
