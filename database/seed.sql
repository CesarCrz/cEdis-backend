-- Base units of measure (must match constants.ts)
INSERT INTO unidades_medida (nombre, simbolo, tipo, factor) VALUES
  ('Gramo', 'g', 'peso', 1),
  ('Kilogramo', 'kg', 'peso', 1000),
  ('Miligramo', 'mg', 'peso', 0.001),
  ('Mililitro', 'mL', 'volumen', 1),
  ('Litro', 'L', 'volumen', 1000),
  ('Pieza', 'pza', 'unidad', 1);
