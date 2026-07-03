import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { insertKardexEntry, updateInsumoStock } from '@/lib/services/kardex.service'
import { toBaseUnits } from '@/lib/utils/unit-conversion'

type Params = { params: Promise<{ cedisId: string; id: string }> }

export async function DELETE(req: NextRequest, { params }: Params) {
  const { cedisId, id } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const { data: merma } = await supabaseAdmin
        .from('mermas')
        .select('*, unidad:unidades_medida(id,factor)')
        .eq('id', id)
        .eq('cedis_id', cedisId)
        .single()

      if (!merma) return err('NOT_FOUND', 'Merma not found', 404)

      // Only allow deletion within 24 hours of creation (correction window)
      const createdAt = new Date(merma.created_at)
      const now = new Date()
      const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      if (hoursDiff > 24) {
        return err('FORBIDDEN', 'Solo se pueden corregir mermas dentro de las 24h de registro', 403)
      }

      // Reverse the stock change (add back the merma quantity)
      const factor = Number((merma.unidad as { factor: number } | null)?.factor ?? 1)
      const deltaBase = toBaseUnits(Number(merma.cantidad), factor)

      const { antes, despues } = await updateInsumoStock(merma.insumo_id, +deltaBase)

      // Insert reversal kardex entry
      await insertKardexEntry({
        cedis_id: cedisId,
        insumo_id: merma.insumo_id,
        tipo: 'ajuste_manual',
        cantidad: +deltaBase,
        unidad_id: merma.unidad_id,
        stock_antes: antes,
        stock_despues: despues,
        referencia_tipo: 'merma_reversal',
        referencia_id: id,
        usuario_id: userId,
        notas: `Corrección de merma: ${merma.motivo}`,
      })

      // Also delete the original merma kardex entry
      await supabaseAdmin
        .from('kardex')
        .delete()
        .eq('referencia_id', id)
        .eq('tipo', 'merma')

      await supabaseAdmin.from('mermas').delete().eq('id', id)
      await logAction(cedisId, userId, 'delete', 'merma', id, merma, null)

      return ok({ id, deleted: true, stock_restaurado: despues })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
