import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { inviteUsuarioSchema } from '@/lib/validations/usuario'
import { INVITATION_EXPIRY_DAYS } from '@/lib/constants'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const [membersResult, invitationsResult, cedisResult] = await Promise.all([
        supabaseAdmin
          .from('cedis_members')
          .select('user_id, role, accepted_at, invited_at, profile:profiles(id,full_name)')
          .eq('cedis_id', cedisId),
        supabaseAdmin
          .from('invitations')
          .select('id, email, role, expires_at, accepted_at, created_at')
          .eq('cedis_id', cedisId)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString()),
        supabaseAdmin
          .from('cedis')
          .select('owner_id, owner:profiles!cedis_owner_id_fkey(id,full_name)')
          .eq('id', cedisId)
          .single(),
      ])

      const members = (membersResult.data ?? []).map(m => ({
        user_id: m.user_id,
        full_name: (m.profile as unknown as { full_name: string } | null)?.full_name ?? null,
        role: m.role,
        accepted_at: m.accepted_at,
        invited_at: m.invited_at,
      }))

      // Also include owner as a member
      if (cedisResult.data) {
        const owner = cedisResult.data
        const ownerProfile = owner.owner as unknown as { id: string; full_name: string } | null
        if (ownerProfile) {
          members.unshift({
            user_id: owner.owner_id,
            full_name: ownerProfile.full_name,
            role: 'owner',
            accepted_at: null,
            invited_at: null,
          })
        }
      }

      return ok({
        members,
        invitations: invitationsResult.data ?? [],
      })
    })
  )
}

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = inviteUsuarioSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten())

      const { email, role: inviteRole } = parsed.data

      // Check if already a member (by looking up profile with this email)
      const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
      const existingProfile = existingUser?.users?.find(u => u.email === email)

      if (existingProfile) {
        // Check if already a cedis member
        const { data: member } = await supabaseAdmin
          .from('cedis_members')
          .select('id')
          .eq('cedis_id', cedisId)
          .eq('user_id', existingProfile.id)
          .single()

        if (member) return err('CONFLICT', 'Este usuario ya es miembro del CEDIS', 409)

        // Also check if they're the owner
        const { data: cedis } = await supabaseAdmin
          .from('cedis')
          .select('owner_id')
          .eq('id', cedisId)
          .single()

        if (cedis?.owner_id === existingProfile.id) {
          return err('CONFLICT', 'Este usuario es el propietario del CEDIS', 409)
        }
      }

      // Check for existing pending invitation
      const { data: existingInvitation } = await supabaseAdmin
        .from('invitations')
        .select('id')
        .eq('cedis_id', cedisId)
        .eq('email', email)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (existingInvitation) {
        return err('CONFLICT', 'Ya existe una invitación pendiente para este email', 409)
      }

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS)

      const { data: invitation, error: invErr } = await supabaseAdmin
        .from('invitations')
        .insert({
          cedis_id: cedisId,
          email,
          role: inviteRole,
          invited_by: userId,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (invErr) return err('DB_ERROR', 'Failed to create invitation', 500)

      // Send invite email via Supabase Auth
      try {
        const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/invite/accept?token=${invitation.token}&cedis_id=${cedisId}`
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: {
            invitation_id: invitation.id,
            cedis_id: cedisId,
            role: inviteRole,
          },
        })
      } catch (e) {
        // Don't fail if email sending fails — invitation is created
        console.error('[invite] Failed to send invite email:', e)
      }

      await logAction(cedisId, userId, 'invite', 'usuario', invitation.id, null, { email, role: inviteRole })
      return ok(invitation, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
