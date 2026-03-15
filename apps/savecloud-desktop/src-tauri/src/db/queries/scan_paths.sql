-- Consultas para rutas personalizadas de escaneo

-- name: get_all_scan_paths
-- Obtiene todas las rutas de escaneo personalizadas
SELECT path FROM custom_scan_paths ORDER BY created_at;

-- name: add_scan_path
-- Agrega una nueva ruta de escaneo
INSERT INTO custom_scan_paths (path) VALUES (?1)
ON CONFLICT(path) DO NOTHING;

-- name: remove_scan_path
-- Elimina una ruta de escaneo
DELETE FROM custom_scan_paths WHERE path = ?1;

-- name: scan_path_exists
-- Verifica si una ruta ya existe
SELECT 1 FROM custom_scan_paths WHERE path = ?1;

-- name: count_scan_paths
-- Cuenta el total de rutas de escaneo
SELECT COUNT(*) FROM custom_scan_paths;

-- name: clear_all_scan_paths
-- Elimina todas las rutas de escaneo
DELETE FROM custom_scan_paths;
