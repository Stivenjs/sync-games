-- Consultas para el historial de operaciones

-- name: append_operation
-- Agrega una nueva entrada al historial
INSERT INTO operation_history (game_id, kind, file_count, err_count, details)
VALUES (?1, ?2, ?3, ?4, ?5);

-- name: get_recent_operations
-- Obtiene las operaciones más recientes con paginación
SELECT 
    oh.id,
    oh.game_id,
    g.name as game_name,
    oh.kind,
    oh.file_count,
    oh.err_count,
    oh.timestamp,
    oh.details
FROM operation_history oh
LEFT JOIN games g ON oh.game_id = g.id
ORDER BY oh.timestamp DESC
LIMIT ?1 OFFSET ?2;

-- name: get_operations_for_game
-- Obtiene operaciones de un juego específico
SELECT 
    kind,
    file_count,
    err_count,
    timestamp,
    details
FROM operation_history
WHERE game_id = ?1
ORDER BY timestamp DESC
LIMIT ?2 OFFSET ?3;

-- name: get_operation_stats_by_game
-- Estadísticas agregadas por juego
SELECT 
    game_id,
    COUNT(*) as total_operations,
    SUM(file_count) as total_files,
    SUM(err_count) as total_errors,
    MAX(timestamp) as last_operation
FROM operation_history
GROUP BY game_id;

-- name: cleanup_old_operations
-- Elimina operaciones antiguas manteniendo las N más recientes
DELETE FROM operation_history 
WHERE id IN (
    SELECT id FROM operation_history 
    ORDER BY timestamp DESC 
    LIMIT -1 OFFSET ?1
);

-- name: count_operations
-- Cuenta el total de operaciones
SELECT COUNT(*) FROM operation_history;

-- name: count_operations_for_game
-- Cuenta operaciones de un juego específico
SELECT COUNT(*) FROM operation_history WHERE game_id = ?1;

-- name: get_operations_by_kind
-- Obtiene operaciones filtradas por tipo
SELECT 
    oh.id,
    oh.game_id,
    g.name as game_name,
    oh.kind,
    oh.file_count,
    oh.err_count,
    oh.timestamp
FROM operation_history oh
LEFT JOIN games g ON oh.game_id = g.id
WHERE oh.kind = ?1 
ORDER BY oh.timestamp DESC
LIMIT ?2 OFFSET ?3;

-- name: get_operations_in_date_range
-- Obtiene operaciones en un rango de fechas
SELECT 
    oh.id,
    oh.game_id,
    g.name as game_name,
    oh.kind,
    oh.file_count,
    oh.err_count,
    oh.timestamp
FROM operation_history oh
LEFT JOIN games g ON oh.game_id = g.id
WHERE oh.timestamp >= ?1 AND oh.timestamp <= ?2
ORDER BY oh.timestamp DESC;
