import { supabaseAdmin } from '@/lib/supabase/admin'

// Check if insumo is now below minimum and create/update notification
export async function checkAndNotifyLowStock(
  cedisId: string,
  insumoId: string,
  stockActual: number,
  stockMinimo: number,
  affectedUserIds: string[] // notify all cedis members
): Promise<void> {
  try {
    if (stockActual <= stockMinimo) {
      // Fetch insumo name for the notification body
      const { data: insumo } = await supabaseAdmin
        .from('insumos')
        .select('nombre, sku')
        .eq('id', insumoId)
        .single()

      const nombre = insumo?.nombre ?? 'Insumo'
      const titulo = `Stock bajo: ${nombre}`
      const cuerpo = `El stock actual (${stockActual}) es igual o menor al mínimo (${stockMinimo}).`

      // Upsert one notification per user (insert if no unread stock_bajo exists for this insumo)
      for (const userId of affectedUserIds) {
        // Check for existing unread stock_bajo notification for this insumo+user+cedis
        const { data: existing } = await supabaseAdmin
          .from('notificaciones')
          .select('id')
          .eq('cedis_id', cedisId)
          .eq('usuario_id', userId)
          .eq('tipo', 'stock_bajo')
          .eq('referencia_id', insumoId)
          .eq('leida', false)
          .maybeSingle()

        if (!existing) {
          await supabaseAdmin.from('notificaciones').insert({
            cedis_id: cedisId,
            usuario_id: userId,
            tipo: 'stock_bajo',
            titulo,
            cuerpo,
            referencia_id: insumoId,
            leida: false,
          })
        }
      }
    } else {
      // Stock is back above minimum — mark any unread stock_bajo notifications for this insumo as read
      await supabaseAdmin
        .from('notificaciones')
        .update({ leida: true })
        .eq('cedis_id', cedisId)
        .eq('tipo', 'stock_bajo')
        .eq('referencia_id', insumoId)
        .eq('leida', false)
    }
  } catch (e) {
    // Never let stock alert logic break the main flow
    console.error('[stock-alert] Failed to process low stock notification:', e)
  }
}

// Get all user IDs (owner + members) for a cedis
export async function getCedisMemberIds(cedisId: string): Promise<string[]> {
  const [{ data: cedis }, { data: members }] = await Promise.all([
    supabaseAdmin.from('cedis').select('owner_id').eq('id', cedisId).single(),
    supabaseAdmin
      .from('cedis_members')
      .select('user_id')
      .eq('cedis_id', cedisId)
      .not('accepted_at', 'is', null),
  ])

  const ids: string[] = []
  if (cedis?.owner_id) ids.push(cedis.owner_id)
  if (members) ids.push(...members.map((m: { user_id: string }) => m.user_id))
  return [...new Set(ids)]
}
