-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cedis ENABLE ROW LEVEL SECURITY;
ALTER TABLE cedis_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades_medida ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE receta_variaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE receta_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE canales_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantilla_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrada_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_declaradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_declarada_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mermas ENABLE ROW LEVEL SECURITY;
ALTER TABLE kardex ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper functions
-- ============================================================

-- Returns 'owner', 'admin', 'viewer', or NULL for current user in a cedis
CREATE OR REPLACE FUNCTION get_user_cedis_role(p_cedis_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM cedis WHERE id = p_cedis_id AND owner_id = auth.uid())
      THEN 'owner'
    ELSE (
      SELECT role FROM cedis_members
      WHERE cedis_id = p_cedis_id AND user_id = auth.uid() AND accepted_at IS NOT NULL
      LIMIT 1
    )
  END;
$$;

-- Returns TRUE if user can write (owner or admin) in a cedis
CREATE OR REPLACE FUNCTION user_can_write_cedis(p_cedis_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT get_user_cedis_role(p_cedis_id) IN ('owner', 'admin');
$$;

-- ============================================================
-- profiles policies
-- ============================================================

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ============================================================
-- unidades_medida policies (global read, service_role write)
-- ============================================================

CREATE POLICY "uom_select_authenticated"
  ON unidades_medida FOR SELECT
  TO authenticated
  USING (TRUE);

-- ============================================================
-- cedis policies
-- ============================================================

CREATE POLICY "cedis_select_member_or_owner"
  ON cedis FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cedis_members
      WHERE cedis_id = cedis.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "cedis_insert_authenticated"
  ON cedis FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "cedis_update_owner_or_admin"
  ON cedis FOR UPDATE
  USING (user_can_write_cedis(id));

CREATE POLICY "cedis_delete_owner"
  ON cedis FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================
-- cedis_members policies
-- ============================================================

CREATE POLICY "cedis_members_select_member"
  ON cedis_members FOR SELECT
  USING (get_user_cedis_role(cedis_id) IS NOT NULL);

CREATE POLICY "cedis_members_insert_write"
  ON cedis_members FOR INSERT
  WITH CHECK (user_can_write_cedis(cedis_id));

CREATE POLICY "cedis_members_update_write"
  ON cedis_members FOR UPDATE
  USING (user_can_write_cedis(cedis_id));

CREATE POLICY "cedis_members_delete_write"
  ON cedis_members FOR DELETE
  USING (user_can_write_cedis(cedis_id));

-- ============================================================
-- invitations policies
-- ============================================================

CREATE POLICY "invitations_select_member"
  ON invitations FOR SELECT
  USING (get_user_cedis_role(cedis_id) IS NOT NULL);

CREATE POLICY "invitations_insert_write"
  ON invitations FOR INSERT
  WITH CHECK (user_can_write_cedis(cedis_id));

CREATE POLICY "invitations_delete_write"
  ON invitations FOR DELETE
  USING (user_can_write_cedis(cedis_id));

-- ============================================================
-- Macro: standard CEDIS-scoped table policies
-- Applied to: categorias, proveedores, insumos, recetas, clientes,
--             canales_venta, plantillas_pedido, entradas, tickets_venta,
--             ventas_declaradas, mermas, notificaciones
-- ============================================================

-- categorias
CREATE POLICY "categorias_select" ON categorias FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "categorias_insert" ON categorias FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "categorias_update" ON categorias FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "categorias_delete" ON categorias FOR DELETE USING (user_can_write_cedis(cedis_id));

-- proveedores
CREATE POLICY "proveedores_select" ON proveedores FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "proveedores_insert" ON proveedores FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "proveedores_update" ON proveedores FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "proveedores_delete" ON proveedores FOR DELETE USING (user_can_write_cedis(cedis_id));

-- insumos
CREATE POLICY "insumos_select" ON insumos FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "insumos_insert" ON insumos FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "insumos_update" ON insumos FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "insumos_delete" ON insumos FOR DELETE USING (user_can_write_cedis(cedis_id));

-- insumo_price_history
CREATE POLICY "iph_select" ON insumo_price_history FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "iph_insert" ON insumo_price_history FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));

-- recetas
CREATE POLICY "recetas_select" ON recetas FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "recetas_insert" ON recetas FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "recetas_update" ON recetas FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "recetas_delete" ON recetas FOR DELETE USING (user_can_write_cedis(cedis_id));

-- receta_variaciones (access via receta → cedis)
CREATE POLICY "rv_select" ON receta_variaciones FOR SELECT
  USING (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND get_user_cedis_role(r.cedis_id) IS NOT NULL));
CREATE POLICY "rv_insert" ON receta_variaciones FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND user_can_write_cedis(r.cedis_id)));
CREATE POLICY "rv_update" ON receta_variaciones FOR UPDATE
  USING (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND user_can_write_cedis(r.cedis_id)));
CREATE POLICY "rv_delete" ON receta_variaciones FOR DELETE
  USING (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND user_can_write_cedis(r.cedis_id)));

-- receta_ingredientes (access via receta → cedis)
CREATE POLICY "ri_select" ON receta_ingredientes FOR SELECT
  USING (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND get_user_cedis_role(r.cedis_id) IS NOT NULL));
CREATE POLICY "ri_insert" ON receta_ingredientes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND user_can_write_cedis(r.cedis_id)));
CREATE POLICY "ri_update" ON receta_ingredientes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND user_can_write_cedis(r.cedis_id)));
CREATE POLICY "ri_delete" ON receta_ingredientes FOR DELETE
  USING (EXISTS (SELECT 1 FROM recetas r WHERE r.id = receta_id AND user_can_write_cedis(r.cedis_id)));

-- clientes
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "clientes_insert" ON clientes FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (user_can_write_cedis(cedis_id));

-- canales_venta
CREATE POLICY "cv_select" ON canales_venta FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "cv_insert" ON canales_venta FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "cv_update" ON canales_venta FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "cv_delete" ON canales_venta FOR DELETE USING (user_can_write_cedis(cedis_id));

-- plantillas_pedido
CREATE POLICY "pp_select" ON plantillas_pedido FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "pp_insert" ON plantillas_pedido FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "pp_update" ON plantillas_pedido FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "pp_delete" ON plantillas_pedido FOR DELETE USING (user_can_write_cedis(cedis_id));

-- plantilla_items (access via plantilla → cedis)
CREATE POLICY "pi_select" ON plantilla_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM plantillas_pedido p WHERE p.id = plantilla_id AND get_user_cedis_role(p.cedis_id) IS NOT NULL));
CREATE POLICY "pi_insert" ON plantilla_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plantillas_pedido p WHERE p.id = plantilla_id AND user_can_write_cedis(p.cedis_id)));
CREATE POLICY "pi_update" ON plantilla_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM plantillas_pedido p WHERE p.id = plantilla_id AND user_can_write_cedis(p.cedis_id)));
CREATE POLICY "pi_delete" ON plantilla_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM plantillas_pedido p WHERE p.id = plantilla_id AND user_can_write_cedis(p.cedis_id)));

-- entradas
CREATE POLICY "entradas_select" ON entradas FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "entradas_insert" ON entradas FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "entradas_update" ON entradas FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "entradas_delete" ON entradas FOR DELETE USING (user_can_write_cedis(cedis_id));

-- entrada_items (access via entrada → cedis)
CREATE POLICY "ei_select" ON entrada_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM entradas e WHERE e.id = entrada_id AND get_user_cedis_role(e.cedis_id) IS NOT NULL));
CREATE POLICY "ei_insert" ON entrada_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM entradas e WHERE e.id = entrada_id AND user_can_write_cedis(e.cedis_id)));
CREATE POLICY "ei_update" ON entrada_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM entradas e WHERE e.id = entrada_id AND user_can_write_cedis(e.cedis_id)));
CREATE POLICY "ei_delete" ON entrada_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM entradas e WHERE e.id = entrada_id AND user_can_write_cedis(e.cedis_id)));

-- tickets_venta
CREATE POLICY "tv_select" ON tickets_venta FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "tv_insert" ON tickets_venta FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "tv_update" ON tickets_venta FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "tv_delete" ON tickets_venta FOR DELETE USING (user_can_write_cedis(cedis_id));

-- ticket_items (access via ticket → cedis)
CREATE POLICY "ti_select" ON ticket_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM tickets_venta t WHERE t.id = ticket_id AND get_user_cedis_role(t.cedis_id) IS NOT NULL));
CREATE POLICY "ti_insert" ON ticket_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM tickets_venta t WHERE t.id = ticket_id AND user_can_write_cedis(t.cedis_id)));
CREATE POLICY "ti_update" ON ticket_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM tickets_venta t WHERE t.id = ticket_id AND user_can_write_cedis(t.cedis_id)));
CREATE POLICY "ti_delete" ON ticket_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM tickets_venta t WHERE t.id = ticket_id AND user_can_write_cedis(t.cedis_id)));

-- ventas_declaradas
CREATE POLICY "vd_select" ON ventas_declaradas FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "vd_insert" ON ventas_declaradas FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "vd_update" ON ventas_declaradas FOR UPDATE USING (user_can_write_cedis(cedis_id));
CREATE POLICY "vd_delete" ON ventas_declaradas FOR DELETE USING (user_can_write_cedis(cedis_id));

-- venta_declarada_items (access via venta_declarada → cedis)
CREATE POLICY "vdi_select" ON venta_declarada_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM ventas_declaradas v WHERE v.id = venta_declarada_id AND get_user_cedis_role(v.cedis_id) IS NOT NULL));
CREATE POLICY "vdi_insert" ON venta_declarada_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM ventas_declaradas v WHERE v.id = venta_declarada_id AND user_can_write_cedis(v.cedis_id)));
CREATE POLICY "vdi_update" ON venta_declarada_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM ventas_declaradas v WHERE v.id = venta_declarada_id AND user_can_write_cedis(v.cedis_id)));
CREATE POLICY "vdi_delete" ON venta_declarada_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM ventas_declaradas v WHERE v.id = venta_declarada_id AND user_can_write_cedis(v.cedis_id)));

-- mermas
CREATE POLICY "mermas_select" ON mermas FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "mermas_insert" ON mermas FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));
CREATE POLICY "mermas_delete" ON mermas FOR DELETE USING (user_can_write_cedis(cedis_id));

-- kardex — INSERT only via service_role (backend inserts, not users directly)
CREATE POLICY "kardex_select" ON kardex FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
-- No INSERT policy for authenticated role; service_role bypasses RLS

-- inventario_ajustes — INSERT only for owner or admin
CREATE POLICY "ia_select" ON inventario_ajustes FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);
CREATE POLICY "ia_insert" ON inventario_ajustes FOR INSERT WITH CHECK (user_can_write_cedis(cedis_id));

-- audit_log — select only (service_role writes)
CREATE POLICY "audit_select" ON audit_log FOR SELECT USING (get_user_cedis_role(cedis_id) IS NOT NULL);

-- notificaciones — user sees their own
CREATE POLICY "notif_select" ON notificaciones FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "notif_update_own" ON notificaciones FOR UPDATE USING (usuario_id = auth.uid());
