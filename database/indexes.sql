-- ============================================================
-- Performance Indexes
-- ============================================================

-- Enable trigram extension for fuzzy search on text columns
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- profiles
CREATE INDEX idx_profiles_id ON profiles(id);

-- cedis
CREATE INDEX idx_cedis_owner_id ON cedis(owner_id);
CREATE INDEX idx_cedis_created_at ON cedis(created_at DESC);

-- cedis_members
CREATE INDEX idx_cedis_members_cedis_id ON cedis_members(cedis_id);
CREATE INDEX idx_cedis_members_user_id ON cedis_members(user_id);
CREATE INDEX idx_cedis_members_cedis_user ON cedis_members(cedis_id, user_id);

-- invitations
CREATE INDEX idx_invitations_cedis_id ON invitations(cedis_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- categorias
CREATE INDEX idx_categorias_cedis_id ON categorias(cedis_id);

-- proveedores
CREATE INDEX idx_proveedores_cedis_id ON proveedores(cedis_id);
CREATE INDEX idx_proveedores_cedis_activo ON proveedores(cedis_id, activo);

-- insumos
CREATE INDEX idx_insumos_cedis_id ON insumos(cedis_id);
CREATE INDEX idx_insumos_cedis_activo ON insumos(cedis_id, activo);
CREATE INDEX idx_insumos_categoria_id ON insumos(categoria_id);
CREATE INDEX idx_insumos_proveedor_id ON insumos(proveedor_id);
CREATE INDEX idx_insumos_unidad_id ON insumos(unidad_id);
CREATE INDEX idx_insumos_nombre_trgm ON insumos USING gin (nombre gin_trgm_ops);
CREATE INDEX idx_insumos_sku_trgm ON insumos USING gin (sku gin_trgm_ops);
CREATE INDEX idx_insumos_stock_bajo ON insumos(cedis_id, stock_actual) WHERE stock_actual <= stock_minimo;

-- insumo_price_history
CREATE INDEX idx_iph_insumo_id ON insumo_price_history(insumo_id);
CREATE INDEX idx_iph_cedis_id ON insumo_price_history(cedis_id);
CREATE INDEX idx_iph_created_at ON insumo_price_history(created_at DESC);

-- recetas
CREATE INDEX idx_recetas_cedis_id ON recetas(cedis_id);
CREATE INDEX idx_recetas_cedis_activa ON recetas(cedis_id, activa);

-- receta_variaciones
CREATE INDEX idx_rv_receta_id ON receta_variaciones(receta_id);

-- receta_ingredientes
CREATE INDEX idx_ri_receta_id ON receta_ingredientes(receta_id);
CREATE INDEX idx_ri_insumo_id ON receta_ingredientes(insumo_id);

-- clientes
CREATE INDEX idx_clientes_cedis_id ON clientes(cedis_id);
CREATE INDEX idx_clientes_cedis_activo ON clientes(cedis_id, activo);

-- canales_venta
CREATE INDEX idx_cv_cedis_id ON canales_venta(cedis_id);

-- plantillas_pedido
CREATE INDEX idx_pp_cedis_id ON plantillas_pedido(cedis_id);
CREATE INDEX idx_pp_cliente_id ON plantillas_pedido(cliente_id);

-- plantilla_items
CREATE INDEX idx_pi_plantilla_id ON plantilla_items(plantilla_id);
CREATE INDEX idx_pi_insumo_id ON plantilla_items(insumo_id);

-- entradas
CREATE INDEX idx_entradas_cedis_id ON entradas(cedis_id);
CREATE INDEX idx_entradas_cedis_status ON entradas(cedis_id, status);
CREATE INDEX idx_entradas_cedis_created_at ON entradas(cedis_id, created_at DESC);
CREATE INDEX idx_entradas_proveedor_id ON entradas(proveedor_id);
CREATE INDEX idx_entradas_folio ON entradas(cedis_id, folio);

-- entrada_items
CREATE INDEX idx_ei_entrada_id ON entrada_items(entrada_id);
CREATE INDEX idx_ei_insumo_id ON entrada_items(insumo_id);

-- tickets_venta
CREATE INDEX idx_tv_cedis_id ON tickets_venta(cedis_id);
CREATE INDEX idx_tv_cedis_status ON tickets_venta(cedis_id, status);
CREATE INDEX idx_tv_cedis_created_at ON tickets_venta(cedis_id, created_at DESC);
CREATE INDEX idx_tv_cliente_id ON tickets_venta(cliente_id);
CREATE INDEX idx_tv_folio ON tickets_venta(cedis_id, folio);

-- ticket_items
CREATE INDEX idx_ti_ticket_id ON ticket_items(ticket_id);
CREATE INDEX idx_ti_insumo_id ON ticket_items(insumo_id);

-- ventas_declaradas
CREATE INDEX idx_vd_cedis_id ON ventas_declaradas(cedis_id);
CREATE INDEX idx_vd_cedis_fecha ON ventas_declaradas(cedis_id, fecha DESC);
CREATE INDEX idx_vd_cliente_id ON ventas_declaradas(cliente_id);
CREATE INDEX idx_vd_canal_id ON ventas_declaradas(canal_id);

-- venta_declarada_items
CREATE INDEX idx_vdi_venta_id ON venta_declarada_items(venta_declarada_id);
CREATE INDEX idx_vdi_receta_id ON venta_declarada_items(receta_id);

-- mermas
CREATE INDEX idx_mermas_cedis_id ON mermas(cedis_id);
CREATE INDEX idx_mermas_cedis_created_at ON mermas(cedis_id, created_at DESC);
CREATE INDEX idx_mermas_insumo_id ON mermas(insumo_id);

-- kardex (heavily queried)
CREATE INDEX idx_kardex_cedis_id ON kardex(cedis_id);
CREATE INDEX idx_kardex_insumo_id ON kardex(insumo_id);
CREATE INDEX idx_kardex_cedis_insumo ON kardex(cedis_id, insumo_id);
CREATE INDEX idx_kardex_cedis_created_at ON kardex(cedis_id, created_at DESC);
CREATE INDEX idx_kardex_tipo ON kardex(cedis_id, tipo);
CREATE INDEX idx_kardex_referencia ON kardex(referencia_tipo, referencia_id);
CREATE INDEX idx_kardex_cliente_id ON kardex(cliente_id);

-- inventario_ajustes
CREATE INDEX idx_ia_cedis_id ON inventario_ajustes(cedis_id);
CREATE INDEX idx_ia_insumo_id ON inventario_ajustes(insumo_id);
CREATE INDEX idx_ia_cedis_created_at ON inventario_ajustes(cedis_id, created_at DESC);

-- audit_log
CREATE INDEX idx_audit_cedis_id ON audit_log(cedis_id);
CREATE INDEX idx_audit_usuario_id ON audit_log(usuario_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at DESC);

-- notificaciones
CREATE INDEX idx_notif_usuario_id ON notificaciones(usuario_id);
CREATE INDEX idx_notif_usuario_leida ON notificaciones(usuario_id, leida);
CREATE INDEX idx_notif_cedis_id ON notificaciones(cedis_id);
