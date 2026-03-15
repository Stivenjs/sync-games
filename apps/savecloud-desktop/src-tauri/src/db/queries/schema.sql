-- Esquema principal de la base de datos SQLite para SaveCloud
-- Contiene todas las tablas, índices y triggers necesarios

-- Tabla de configuración global (solo 1 fila, id=1)
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    api_base_url TEXT,
    api_key TEXT,
    user_id TEXT,
    keep_backups_per_game INTEGER DEFAULT 10,
    full_backup_streaming BOOLEAN DEFAULT 0,
    full_backup_streaming_dry_run BOOLEAN DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de juegos configurados por el usuario
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    steam_app_id TEXT,
    image_url TEXT,
    edition_label TEXT,
    source_url TEXT,
    magnet_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de rutas de guardado de cada juego (relación 1-N)
CREATE TABLE IF NOT EXISTS game_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    path_order INTEGER DEFAULT 0,
    UNIQUE(game_id, path)
);

-- Tabla de nombres de ejecutables para detección de proceso (relación 1-N)
CREATE TABLE IF NOT EXISTS executable_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    executable_name TEXT NOT NULL,
    UNIQUE(game_id, executable_name)
);

-- Tabla de historial de operaciones de sincronización
CREATE TABLE IF NOT EXISTS operation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
    kind TEXT NOT NULL, -- 'upload', 'download', 'backup', 'copy_from_friend', etc.
    file_count INTEGER DEFAULT 0,
    err_count INTEGER DEFAULT 0,
    details TEXT, -- JSON opcional para metadata adicional
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de rutas personalizadas de escaneo
CREATE TABLE IF NOT EXISTS custom_scan_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_games_name ON games(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_games_steam_app_id ON games(steam_app_id);
CREATE INDEX IF NOT EXISTS idx_operation_history_game_id ON operation_history(game_id);
CREATE INDEX IF NOT EXISTS idx_operation_history_timestamp ON operation_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_operation_history_kind ON operation_history(kind);
CREATE INDEX IF NOT EXISTS idx_game_paths_path ON game_paths(path);
CREATE INDEX IF NOT EXISTS idx_game_paths_game_id ON game_paths(game_id);

-- Trigger para actualizar updated_at automáticamente en games
CREATE TRIGGER IF NOT EXISTS trg_games_updated_at 
AFTER UPDATE ON games
BEGIN
    UPDATE games SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
