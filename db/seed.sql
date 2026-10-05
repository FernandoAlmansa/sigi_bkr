-- Catálogo base de tipos de insumo. Revisá la lista contra el taller antes de correrlo.
INSERT INTO tipos_insumo (nombre) VALUES
  ('Telas'), ('Elásticos'), ('Tazas'), ('Empaque'), ('Herrajes'),
  ('Dijes'), ('Etiquetas'), ('Regalo'), ('Insumos de oficina'), ('Arcos')
ON CONFLICT (nombre) DO NOTHING;
