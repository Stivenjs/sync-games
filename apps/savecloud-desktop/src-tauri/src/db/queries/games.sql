-- Consultas para la tabla de juegos

-- name: list_all_games
-- Lista todos los juegos con sus rutas concatenadas
SELECT 
    g.id,
    g.name,
    g.steam_app_id,
    g.image_url,
    g.edition_label,
    g.source_url,
    g.magnet_link,
    g.created_at,
    g.updated_at,
    GROUP_CONCAT(gp.path, '|') as paths
FROM games g
LEFT JOIN game_paths gp ON g.id = gp.game_id
GROUP BY g.id
ORDER BY g.name COLLATE NOCASE;

-- name: get_game_by_id
-- Obtiene un juego específico con todas sus relaciones
SELECT 
    g.id,
    g.name,
    g.steam_app_id,
    g.image_url,
    g.edition_label,
    g.source_url,
    g.magnet_link,
    GROUP_CONCAT(DISTINCT gp.path, '|') as paths,
    GROUP_CONCAT(DISTINCT en.executable_name, '|') as executable_names
FROM games g
LEFT JOIN game_paths gp ON g.id = gp.game_id
LEFT JOIN executable_names en ON g.id = en.game_id
WHERE g.id = ?1
GROUP BY g.id;

-- name: search_games_by_name
-- Búsqueda case-insensitive por nombre con paginación
SELECT 
    g.id,
    g.name,
    g.steam_app_id,
    g.image_url,
    GROUP_CONCAT(gp.path, '|') as paths
FROM games g
LEFT JOIN game_paths gp ON g.id = gp.game_id
WHERE g.name LIKE ?1
GROUP BY g.id
ORDER BY g.name COLLATE NOCASE
LIMIT ?2 OFFSET ?3;

-- name: insert_game
-- Inserta un nuevo juego
INSERT INTO games (id, name, steam_app_id, image_url, edition_label, source_url, magnet_link)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);

-- name: update_game
-- Actualiza un juego existente
UPDATE games 
SET name = ?2,
    steam_app_id = ?3,
    image_url = ?4,
    edition_label = ?5,
    source_url = ?6,
    magnet_link = ?7,
    updated_at = CURRENT_TIMESTAMP
WHERE id = ?1;

-- name: delete_game
-- Elimina un juego (cascade elimina paths y executables)
DELETE FROM games WHERE id = ?1;

-- name: rename_game
-- Renombra el ID de un juego
UPDATE games SET id = ?2, name = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1;

-- name: count_games
-- Cuenta el total de juegos
SELECT COUNT(*) FROM games;

-- name: game_exists
-- Verifica si existe un juego por ID
SELECT 1 FROM games WHERE id = ?1;

-- name: game_exists_by_name
-- Verifica si existe un juego por nombre (case-insensitive)
SELECT 1 FROM games WHERE LOWER(name) = LOWER(?1);

-- name: get_games_by_steam_app_id
-- Obtiene juegos por Steam App ID
SELECT id, name, steam_app_id, image_url FROM games WHERE steam_app_id = ?1;
