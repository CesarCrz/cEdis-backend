import { NextRequest, NextResponse } from 'next/server'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { ok, err } from '@/lib/utils/response'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ cedisId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async () => {
      const [
        categoriasResult,
        proveedoresResult,
        clientesResult,
        canalesResult,
        insumosResult,
        recetasResult,
      ] = await Promise.all([
        supabaseAdmin
          .from('categorias')
          .select('id, nombre, created_at')
          .eq('cedis_id', cedisId)
          .order('nombre'),
        supabaseAdmin
          .from('proveedores')
          .select('id, nombre, contacto, telefono, email, notas, activo, created_at')
          .eq('cedis_id', cedisId)
          .order('nombre'),
        supabaseAdmin
          .from('clientes')
          .select('id, nombre, direccion, telefono, email, notas, activo, created_at')
          .eq('cedis_id', cedisId)
          .order('nombre'),
        supabaseAdmin
          .from('canales_venta')
          .select('id, nombre, comision_pct, activo, created_at')
          .eq('cedis_id', cedisId)
          .order('nombre'),
        supabaseAdmin
          .from('insumos')
          .select('id, nombre, sku, descripcion, costo_unitario, stock_minimo, stock_maximo, activo, unidad:unidades_medida(id,nombre,simbolo), categoria:categorias(id,nombre), proveedor:proveedores(id,nombre), created_at')
          .eq('cedis_id', cedisId)
          .order('nombre'),
        supabaseAdmin
          .from('recetas')
          .select('id, nombre, descripcion, activa, created_at, ingredientes:receta_ingredientes(insumo_id, cantidad, unidad:unidades_medida(id,simbolo)), variaciones:receta_variaciones(id,nombre,factor,precio,activa)')
          .eq('cedis_id', cedisId)
          .order('nombre'),
      ])

      if (
        categoriasResult.error ||
        proveedoresResult.error ||
        clientesResult.error ||
        canalesResult.error ||
        insumosResult.error ||
        recetasResult.error
      ) {
        return err('DB_ERROR', 'Failed to export catalog data', 500)
      }

      return ok({
        exported_at: new Date().toISOString(),
        cedis_id: cedisId,
        categorias: categoriasResult.data ?? [],
        proveedores: proveedoresResult.data ?? [],
        clientes: clientesResult.data ?? [],
        canales: canalesResult.data ?? [],
        insumos: insumosResult.data ?? [],
        recetas: recetasResult.data ?? [],
      })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
