-- Consultas para las rutas de juegos

-- name: get_paths_for_game
-- Obtiene todas las rutas de un juego ordenadas
SELECT path, path_order 
FROM game_paths 
WHERE game_id = ?1 
ORDER BY path_order, path;

-- name: add_path_to_game
-- Agrega una nueva ruta a un juego
INSERT INTO game_paths (game_id, path, path_order)
VALUES (?1, ?2, COALESCE(
    (SELECT MAX(path_order) + 1 FROM game_paths WHERE game_id = ?1), 
    0
))
ON CONFLICT(game_id, path) DO NOTHING;

-- name: remove_path_from_game
-- Elimina una ruta específica de un juego
DELETE FROM game_paths WHERE game_id = ?1 AND path = ?2;

-- name: update_game_paths
-- Elimina todas las rutas de un juego (para reemplazo batch)
DELETE FROM game_paths WHERE game_id = ?1;

-- name: get_games_by_path
-- Busca juegos que tengan una ruta que comience con cierto patrón
SELECT g.id, g.name, gp.path
FROM games g
JOIN game_paths gp ON g.id = gp.game_id
WHERE gp.path LIKE ?1 || '%';

-- name: count_paths_for_game
-- Cuenta cuántas rutas tiene un juego
SELECT COUNT(*) FROM game_paths WHERE game_id = ?1;

-- name: path_exists_for_game
-- Verifica si una ruta ya existe para un juego
SELECT 1 FROM game_paths WHERE game_id = ?1 AND path = ?2;
