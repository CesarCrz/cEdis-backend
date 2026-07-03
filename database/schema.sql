-- ============================================================
-- cEdis Database Schema
-- ============================================================

-- 1. profiles — extends auth.users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. cedis
CREATE TABLE cedis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. cedis_members
CREATE TABLE cedis_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (cedis_id, user_id)
);

-- 4. invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  token UUID DEFAULT gen_random_uuid() UNIQUE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. categorias (insumo categories per CEDIS)
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cedis_id, nombre)
);

-- 6. unidades_medida (global, not per cedis)
CREATE TABLE unidades_medida (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  simbolo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('peso', 'volumen', 'unidad')),
  factor NUMERIC(20,10) NOT NULL DEFAULT 1
  -- peso: g=1, kg=1000, mg=0.001
  -- volumen: mL=1, L=1000
  -- unidad: pza=1
);

-- 7. proveedores (suppliers per CEDIS)
CREATE TABLE proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. insumos (ingredients/supplies per CEDIS, stock_actual denormalized for performance)
CREATE TABLE insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  nombre TEXT NOT NULL,
  sku TEXT,
  descripcion TEXT,
  costo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  stock_actual NUMERIC(14,4) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(14,4) NOT NULL DEFAULT 0,
  stock_maximo NUMERIC(14,4),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cedis_id, sku)
);

-- 9. insumo_price_history (price changes log)
CREATE TABLE insumo_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  costo_anterior NUMERIC(14,4) NOT NULL,
  costo_nuevo NUMERIC(14,4) NOT NULL,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. recetas (recipes/platillos per CEDIS)
CREATE TABLE recetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. receta_variaciones (recipe size variations: chico/grande/normal)
CREATE TABLE receta_variaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receta_id UUID NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, -- e.g. 'chico', 'normal', 'grande'
  factor NUMERIC(10,4) NOT NULL DEFAULT 1, -- multiplier over base recipe
  precio NUMERIC(14,4),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (receta_id, nombre)
);

-- 12. receta_ingredientes (ingredients per recipe, unit can differ from insumo's unit)
CREATE TABLE receta_ingredientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receta_id UUID NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  cantidad NUMERIC(14,4) NOT NULL,
  UNIQUE (receta_id, insumo_id)
);

-- 13. clientes (sucursales/branches per CEDIS)
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. canales_venta (sales channels: Uber, Rappi, etc. — per CEDIS)
CREATE TABLE canales_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  comision_pct NUMERIC(5,2) DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cedis_id, nombre)
);

-- 15. plantillas_pedido (order templates per client/cedis)
CREATE TABLE plantillas_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. plantilla_items
CREATE TABLE plantilla_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id UUID NOT NULL REFERENCES plantillas_pedido(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  cantidad NUMERIC(14,4) NOT NULL,
  UNIQUE (plantilla_id, insumo_id)
);

-- 17. entradas (insumo inputs to CEDIS)
-- folio format: ENT-YYYYMMDD-XXXX
CREATE TABLE entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  folio TEXT NOT NULL,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  notas TEXT,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cedis_id, folio)
);

-- 18. entrada_items
CREATE TABLE entrada_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id UUID NOT NULL REFERENCES entradas(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  cantidad NUMERIC(14,4) NOT NULL,
  costo_unitario NUMERIC(14,4) NOT NULL,
  subtotal NUMERIC(14,4) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED
);

-- 19. tickets_venta (distribution tickets from CEDIS to sucursales)
-- folio format: TKT-YYYYMMDD-XXXX
CREATE TABLE tickets_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  folio TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'delivered', 'cancelled')),
  notas TEXT,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cedis_id, folio)
);

-- 20. ticket_items
CREATE TABLE ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets_venta(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  cantidad NUMERIC(14,4) NOT NULL,
  precio_unitario NUMERIC(14,4) NOT NULL,
  subtotal NUMERIC(14,4) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- 21. ventas_declaradas (sales declared by auditor per channel)
CREATE TABLE ventas_declaradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  canal_id UUID NOT NULL REFERENCES canales_venta(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cedis_id, cliente_id, canal_id, fecha)
);

-- 22. venta_declarada_items (receta + cantidad_vendida)
CREATE TABLE venta_declarada_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_declarada_id UUID NOT NULL REFERENCES ventas_declaradas(id) ON DELETE CASCADE,
  receta_id UUID NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  variacion_id UUID REFERENCES receta_variaciones(id) ON DELETE SET NULL,
  cantidad_vendida NUMERIC(14,4) NOT NULL,
  UNIQUE (venta_declarada_id, receta_id, variacion_id)
);

-- 23. mermas (waste/loss records)
CREATE TABLE mermas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  cantidad NUMERIC(14,4) NOT NULL,
  motivo TEXT,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. kardex (movement history — all stock changes flow through here)
CREATE TABLE kardex (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida_venta','ajuste_manual','venta_declarada','merma')),
  cantidad NUMERIC(14,4) NOT NULL, -- positive=in, negative=out
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  stock_antes NUMERIC(14,4) NOT NULL,
  stock_despues NUMERIC(14,4) NOT NULL,
  referencia_tipo TEXT,
  referencia_id UUID,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  canal_id UUID REFERENCES canales_venta(id) ON DELETE SET NULL,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. inventario_ajustes (manual inventory adjustments audit trail)
CREATE TABLE inventario_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id UUID NOT NULL REFERENCES unidades_medida(id),
  cantidad_anterior NUMERIC(14,4) NOT NULL,
  cantidad_nueva NUMERIC(14,4) NOT NULL,
  diferencia NUMERIC(14,4) GENERATED ALWAYS AS (cantidad_nueva - cantidad_anterior) STORED,
  motivo TEXT NOT NULL,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 26. audit_log (who did what when)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID REFERENCES cedis(id) ON DELETE SET NULL,
  usuario_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. notificaciones (in-app notifications)
CREATE TABLE notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedis_id UUID NOT NULL REFERENCES cedis(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('stock_bajo', 'ticket_pendiente', 'invitacion')),
  titulo TEXT NOT NULL,
  cuerpo TEXT,
  referencia_id UUID,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: update updated_at automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cedis_updated_at
  BEFORE UPDATE ON cedis FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_proveedores_updated_at
  BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_insumos_updated_at
  BEFORE UPDATE ON insumos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recetas_updated_at
  BEFORE UPDATE ON recetas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_plantillas_updated_at
  BEFORE UPDATE ON plantillas_pedido FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_entradas_updated_at
  BEFORE UPDATE ON entradas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets_venta FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ventas_declaradas_updated_at
  BEFORE UPDATE ON ventas_declaradas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
