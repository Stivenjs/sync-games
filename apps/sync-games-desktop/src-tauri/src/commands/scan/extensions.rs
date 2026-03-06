//! Extensiones de archivo reconocidas como guardados de videojuegos.
//!
//! Aquí se centralizan todas las extensiones que la app considera como archivos de guardado.
//! Añadir nuevas extensiones en las constantes correspondientes.

// ─── STRONG: Alta probabilidad de ser guardado ─────────────────────────────────
// Estas extensiones identifican claramente archivos de guardado de juegos.

pub const STRONG_SAVE_EXTENSIONS: &[&str] = &[
    // Originales
    ".sav",
    ".savx",
    ".save",
    ".sl2",   // Dark Souls
    ".state", // Save states emuladores
    ".sr",
    // Elder Scrolls / Bethesda
    ".ess", // Skyrim, Oblivion
    ".fos", // Fallout 3/4
    ".bsb", // BioShock
    // Doom
    ".dsg",
    ".zds", // GZDoom
    // RPG Maker
    ".lsd",
    ".rvdata",
    ".rvdata2",
    ".lsw",
    // Emuladores
    ".srm", // SNES SRAM
    ".sgm", // VisualBoyAdvance (GBA)
    ".fcs", // FCEUX (NES)
    ".frz", // Snes9x
    ".svs", // GBA save state
    ".sta", // MAME
    ".ns1", // Nestopia (NES)
    ".jst", // Jnes (NES)
    ".zs3",
    ".zs4",
    ".zs5",
    ".zs6",
    ".zs7",
    ".zs8",
    ".zs9",
    ".zst", // ZSNES
    ".001",
    ".002",
    ".003",
    ".004",
    ".005",
    ".006",
    ".007",
    ".008",
    ".009",
    ".010", // Snes9x slots
    // Blizzard
    ".sc2save", // StarCraft II
    ".w3z",     // Warcraft III
    // Sims / EA
    ".sims3",
    ".age3sav",
    ".age3ysav",
    ".age3xsav",
    // Terraria / Minecraft
    ".plr",     // Terraria jugador
    ".wld",     // Terraria mundo
    ".mcworld", // Minecraft Bedrock
    ".mcr",     // Minecraft región
    ".mca",     // Minecraft Anvil
    ".schematic",
    ".schem",
    // Otros juegos populares
    ".rgd",   // Raft
    ".gms",   // Garry's Mod
    ".pcsav", // Mass Effect 2
    ".masseffectsave",
    ".vdf", // Valve/Source (Half-Life, Portal, CS)
    ".sii", // Euro Truck Simulator
    ".sc4", // SimCity 4
    ".scs", // SimCity Societies
    ".psv", // PlayStation 2 memory card
    ".ps2",
    ".xnb",    // XNA (Stardew Valley, Terraria antiguo)
    ".sg0",    // Humongous Entertainment
    ".ldw",    // Virtual Villagers
    ".pqhero", // Puzzle Quest
    ".dun",    // Dungeon Defenders
    ".escape", // Prison Architect
    ".usa",    // Unreal (antiguo)
    ".bls",    // Blockland
    ".rgss3a", // RPG Maker VX Ace
];

// ─── WEAK: Genéricas, requieren hints en el nombre ────────────────────────────
// Solo cuentan como guardado si el nombre contiene palabras clave (SAVE_NAME_HINTS)
// o si hay 3+ archivos con estas extensiones en la carpeta.

pub const WEAK_SAVE_EXTENSIONS: &[&str] = &[
    ".dat", ".bin", ".bak", ".json", // GameMaker, Deltarune, juegos modernos
    ".ini",  // GameMaker (Undertale, Deltarune Ch.1)
];

// ─── Nombres de carpetas que sugieren guardados ───────────────────────────────
// Si la carpeta tiene uno de estos nombres, se considera candidata con umbral más bajo.
// Excluir nombres genéricos (cloud, user, config) que causan falsos positivos.

pub const SAVE_FOLDER_NAMES: &[&str] = &[
    "saves",
    "save",
    "saved games",
    "savedgames",
    "savegames",
    "save data",
    "savedata",
    "profiles",
    "player",
    "characters",
    "checkpoints",
    "slots",
];

// ─── Hints: Palabras clave en el nombre del archivo ─────────────────────────────
// Si un archivo WEAK contiene alguna de estas palabras, se considera guardado.

pub const SAVE_NAME_HINTS: &[&str] = &[
    "save",
    "slot",
    "profile",
    "progress",
    "checkpoint",
    "autosave",
    "quicksave",
    "player",
    "game",
    "backup",
    "world",
    "character",
];
