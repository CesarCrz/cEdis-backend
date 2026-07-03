import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { withCors } from '@/lib/middleware/cors'
import { withAuth } from '@/lib/middleware/auth'
import { requireRole } from '@/lib/middleware/cedis-access'
import { ok, err } from '@/lib/utils/response'
import { logAction } from '@/lib/utils/audit-log'
import { supabaseAdmin } from '@/lib/supabase/admin'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_ROWS = 1000

function generateSku(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (const byte of bytes) {
    result += chars[byte % chars.length]
  }
  return `INS-${result}`
}

function sanitize(val: unknown): string {
  return String(val ?? '').trim().slice(0, 500)
}

type Params = { params: Promise<{ cedisId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { cedisId } = await params
  return withCors(req, () =>
    withAuth(req, cedisId, async ({ userId, role }) => {
      if (!requireRole('admin', role)) {
        return err('FORBIDDEN', 'Acceso denegado', 403)
      }

      // Parse multipart form data
      let formData: FormData
      try {
        formData = await req.formData()
      } catch {
        return err('BAD_REQUEST', 'Expected multipart/form-data', 400)
      }

      const file = formData.get('file')
      if (!file || !(file instanceof Blob)) {
        return err('VALIDATION_ERROR', 'Missing file field', 400)
      }

      if (file.size > MAX_FILE_SIZE) {
        return err('VALIDATION_ERROR', 'File exceeds 5MB limit', 400)
      }

      const csvText = await file.text()

      // Parse CSV
      const parseResult = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
      })

      if (parseResult.errors.length > 0) {
        return err('VALIDATION_ERROR', 'CSV parse error', 400, parseResult.errors.slice(0, 5))
      }

      const rows = parseResult.data
      if (rows.length === 0) {
        return err('VALIDATION_ERROR', 'CSV has no data rows', 400)
      }

      if (rows.length > MAX_ROWS) {
        return err('VALIDATION_ERROR', `CSV exceeds ${MAX_ROWS} row limit`, 400)
      }

      // Validate required columns
      const required = ['nombre', 'unidad', 'costo_unitario']
      const headers = Object.keys(rows[0])
      const missing = required.filter((c) => !headers.includes(c))
      if (missing.length > 0) {
        return err('VALIDATION_ERROR', `Missing required columns: ${missing.join(', ')}`, 400)
      }

      // Load all unidades_medida for lookup
      const { data: unidades } = await supabaseAdmin
        .from('unidades_medida')
        .select('id, simbolo, nombre')
      const unidadMap = new Map<string, string>() // simbolo → id
      for (const u of unidades ?? []) {
        unidadMap.set(u.simbolo.toLowerCase(), u.id)
        unidadMap.set(u.nombre.toLowerCase(), u.id)
      }

      // Load existing categorias + proveedores for lookup
      const { data: cats } = await supabaseAdmin
        .from('categorias')
        .select('id, nombre')
        .eq('cedis_id', cedisId)
      const catMap = new Map<string, string>()
      for (const c of cats ?? []) catMap.set(c.nombre.toLowerCase(), c.id)

      const { data: provs } = await supabaseAdmin
        .from('proveedores')
        .select('id, nombre')
        .eq('cedis_id', cedisId)
      const provMap = new Map<string, string>()
      for (const p of provs ?? []) provMap.set(p.nombre.toLowerCase(), p.id)

      const errors: { row: number; message: string }[] = []
      const toInsert: Record<string, unknown>[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2 // 1-indexed + header

        const nombre = sanitize(row['nombre'])
        if (!nombre) {
          errors.push({ row: rowNum, message: 'nombre is required' })
          continue
        }

        const unidadRaw = sanitize(row['unidad']).toLowerCase()
        const unidadId = unidadMap.get(unidadRaw)
        if (!unidadId) {
          errors.push({ row: rowNum, message: `Unknown unit: "${row['unidad']}"` })
          continue
        }

        const costoRaw = parseFloat(row['costo_unitario'])
        if (isNaN(costoRaw) || costoRaw < 0) {
          errors.push({ row: rowNum, message: `Invalid costo_unitario: "${row['costo_unitario']}"` })
          continue
        }

        const stockMinimoRaw = row['stock_minimo'] ? parseFloat(row['stock_minimo']) : 0
        const stockInicial = row['stock_inicial'] ? parseFloat(row['stock_inicial']) : 0

        // Resolve or create categoria
        let categoriaId: string | null = null
        const catNombre = sanitize(row['categoria'])
        if (catNombre) {
          const key = catNombre.toLowerCase()
          if (catMap.has(key)) {
            categoriaId = catMap.get(key)!
          } else {
            const { data: newCat } = await supabaseAdmin
              .from('categorias')
              .insert({ cedis_id: cedisId, nombre: catNombre })
              .select('id')
              .single()
            if (newCat) {
              catMap.set(key, newCat.id)
              categoriaId = newCat.id
            }
          }
        }

        // Resolve or create proveedor
        let proveedorId: string | null = null
        const provNombre = sanitize(row['proveedor'])
        if (provNombre) {
          const key = provNombre.toLowerCase()
          if (provMap.has(key)) {
            proveedorId = provMap.get(key)!
          } else {
            const { data: newProv } = await supabaseAdmin
              .from('proveedores')
              .insert({ cedis_id: cedisId, nombre: provNombre })
              .select('id')
              .single()
            if (newProv) {
              provMap.set(key, newProv.id)
              proveedorId = newProv.id
            }
          }
        }

        const sku = sanitize(row['sku']) || generateSku()

        toInsert.push({
          cedis_id: cedisId,
          nombre,
          sku,
          unidad_id: unidadId,
          costo_unitario: costoRaw,
          stock_minimo: isNaN(stockMinimoRaw) ? 0 : stockMinimoRaw,
          stock_actual: isNaN(stockInicial) ? 0 : stockInicial,
          categoria_id: categoriaId,
          proveedor_id: proveedorId,
        })
      }

      let imported = 0
      if (toInsert.length > 0) {
        // Batch insert (ignore duplicates by sku)
        const { data: inserted, error: bulkErr } = await supabaseAdmin
          .from('insumos')
          .insert(toInsert)
          .select('id')

        if (bulkErr) {
          return err('DB_ERROR', 'Failed to import insumos', 500, bulkErr.message)
        }
        imported = inserted?.length ?? 0

        await logAction(cedisId, userId, 'import_csv', 'insumo', undefined, null, { imported })
      }

      return ok({ imported, errors })
    })
  )
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, async () => new NextResponse(null, { status: 204 }))
}
