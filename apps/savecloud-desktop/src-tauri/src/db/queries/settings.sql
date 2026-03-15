-- Consultas para la tabla de configuración global

-- name: get_settings
-- Obtiene la configuración global (siempre id=1)
SELECT 
    api_base_url,
    api_key,
    user_id,
    keep_backups_per_game,
    full_backup_streaming,
    full_backup_streaming_dry_run,
    updated_at
FROM settings
WHERE id = 1;

-- name: upsert_settings
-- Inserta o actualiza la configuración global
INSERT INTO settings (
    id, api_base_url, api_key, user_id, 
    keep_backups_per_game, full_backup_streaming, full_backup_streaming_dry_run
) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
ON CONFLICT(id) DO UPDATE SET
    api_base_url = COALESCE(?1, api_base_url),
    api_key = COALESCE(?2, api_key),
    user_id = COALESCE(?3, user_id),
    keep_backups_per_game = COALESCE(?4, keep_backups_per_game),
    full_backup_streaming = COALESCE(?5, full_backup_streaming),
    full_backup_streaming_dry_run = COALESCE(?6, full_backup_streaming_dry_run),
    updated_at = CURRENT_TIMESTAMP;

-- name: update_api_config
-- Actualiza solo los campos de API
UPDATE settings 
SET api_base_url = ?1, api_key = ?2, user_id = ?3, updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

-- name: update_feature_flags
-- Actualiza solo los feature flags
UPDATE settings 
SET full_backup_streaming = ?1, full_backup_streaming_dry_run = ?2, updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

-- name: update_backup_settings
-- Actualiza configuración de backups
UPDATE settings 
SET keep_backups_per_game = ?1, updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
