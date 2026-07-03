import { supabaseAdmin } from '@/lib/supabase/admin'

export async function logAction(
  cedisId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  oldValue?: unknown,
  newValue?: unknown
): Promise<void> {
  try {
    await supabaseAdmin.from('audit_log').insert({
      cedis_id: cedisId,
      usuario_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
    })
  } catch (e) {
    // Never let audit logging break the main flow
    console.error('[audit_log] Failed to write audit entry:', e)
  }
}
