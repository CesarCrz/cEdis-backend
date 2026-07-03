import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { z } from 'zod'

type Params = { params: Promise<{ cedisId: string }> }

const importSchema = z.object({
  categorias: z.array(z.object({ nombre: z.string().min(1) })).optional(),
  proveedores: z.array(z.object({
    nombre: z.string().min(1),
    contacto: z.string().optional().nullable(),
    telefono: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    notas: z.string().optional().nullable(),
  })).optional(),
  clientes: z.array(z.object({
    nombre: z.string().min(1),
    direccion: z.string().optional().nullable(),
    telefono: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    notas: z.string().optional().nullable(),
  })).optional(),
  canales: z.array(z.object({
    nombre: z.string().min(1),
    comision_pct: z.number().min(0).max(100).optional(),
  })).optional(),
  insumos: z.array(z.object({
    nombre: z.string().min(1),
    sku: z.string().optional().nullable(),
    unidad_simbolo: z.string().min(1), // e.g. 'kg', 'g', 'pza'
    costo_unitario: z.number().min(0).optional(),
    stock_minimo: z.number().min(0).optional(),
    categoria_nombre: z.string().optional().nullable(),
    proveedor_nombre: z.string().optional().nullable(),
  })).optional(),
  recetas: z.array(z.object({
    nombre: z.string().min(1),
    descripcion: z.string().optional().nullable(),
  })).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) return err('FORBIDDEN', 'Acceso denegado', 403)

      const body = await req.json().catch(() => null)
      const parsed = importSchema.safeParse(body)
      if (!parsed.success) return err('VALIDATION_ERROR', 'Invalid import data', 400, parsed.error.flatten())

      const data = parsed.data
      const summary: Record<string, number> = {}

      // Import categorias
      if (data.categorias?.length) {
        const rows = data.categorias.map(c => ({ cedis_id: cedisId, nombre: c.nombre }))
        const { data: inserted, error } = await supabaseAdmin
          .from('categorias')
          .upsert(rows, { onConflict: 'cedis_id,nombre', ignoreDuplicates: true })
          .select()
        if (!error) summary.categorias = inserted?.length ?? 0
      }

      // Import proveedores
      if (data.proveedores?.length) {
        const rows = data.proveedores.map(p => ({ cedis_id: cedisId, ...p }))
        const { data: inserted, error } = await supabaseAdmin
          .from('proveedores')
          .insert(rows)
          .select()
        if (!error) summary.proveedores = inserted?.length ?? 0
      }

      // Import clientes
      if (data.clientes?.length) {
        const rows = data.clientes.map(c => ({ cedis_id: cedisId, ...c }))
        const { data: inserted, error } = await supabaseAdmin
          .from('clientes')
          .insert(rows)
          .select()
        if (!error) summary.clientes = inserted?.length ?? 0
      }

      // Import canales
      if (data.canales?.length) {
        const rows = data.canales.map(c => ({ cedis_id: cedisId, nombre: c.nombre, comision_pct: c.comision_pct ?? 0 }))
        const { data: inserted, error } = await supabaseAdmin
          .from('canales_venta')
          .upsert(rows, { onConflict: 'cedis_id,nombre', ignoreDuplicates: true })
          .select()
        if (!error) summary.canales = inserted?.length ?? 0
      }

      // Import insumos (requires unit lookup)
      if (data.insumos?.length) {
        // Fetch all units
        const { data: unidades } = await supabaseAdmin.from('unidades_medida').select('id, simbolo')
        const unidadMap = Object.fromEntries((unidades ?? []).map(u => [u.simbolo, u.id]))

        // Fetch categorias for name lookup
        const { data: categorias } = await supabaseAdmin.from('categorias').select('id, nombre').eq('cedis_id', cedisId)
        const categoriaMap = Object.fromEntries((categorias ?? []).map(c => [c.nombre, c.id]))

        // Fetch proveedores for name lookup
        const { data: proveedores } = await supabaseAdmin.from('proveedores').select('id, nombre').eq('cedis_id', cedisId)
        const proveedorMap = Object.fromEntries((proveedores ?? []).map(p => [p.nombre, p.id]))

        const rows = data.insumos
          .filter(i => unidadMap[i.unidad_simbolo])
          .map(i => ({
            cedis_id: cedisId,
            nombre: i.nombre,
            sku: i.sku ?? null,
            unidad_id: unidadMap[i.unidad_simbolo],
            costo_unitario: i.costo_unitario ?? 0,
            stock_minimo: i.stock_minimo ?? 0,
            stock_actual: 0,
            categoria_id: i.categoria_nombre ? (categoriaMap[i.categoria_nombre] ?? null) : null,
            proveedor_id: i.proveedor_nombre ? (proveedorMap[i.proveedor_nombre] ?? null) : null,
          }))

        if (rows.length > 0) {
          const { data: inserted, error } = await supabaseAdmin.from('insumos').insert(rows).select()
          if (!error) summary.insumos = inserted?.length ?? 0
        }
      }

      // Import recetas
      if (data.recetas?.length) {
        const rows = data.recetas.map(r => ({ cedis_id: cedisId, nombre: r.nombre, descripcion: r.descripcion ?? null }))
        const { data: inserted, error } = await supabaseAdmin.from('recetas').insert(rows).select()
        if (!error) summary.recetas = inserted?.length ?? 0
      }

      await logAction(cedisId, userId, 'import', 'catalogo', undefined, null, summary)
      return ok({ imported: summary }, 201)
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
