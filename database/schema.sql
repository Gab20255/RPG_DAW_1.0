-- ============================================
-- SCHEMA DO BANCO DE DADOS — RPG Multiplayer
-- ============================================
-- Execute este arquivo para criar as tabelas:
--   sqlite3 rpg.db < database/schema.sql

-- Tabela de Usuários (autenticação)
CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    email       TEXT    NOT NULL UNIQUE,
    senha_hash  TEXT    NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Personagens (ficha do jogador)
CREATE TABLE IF NOT EXISTS personagens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id      INTEGER NOT NULL,
    nome            TEXT    NOT NULL,
    classe          TEXT    NOT NULL,
    nivel           INTEGER DEFAULT 1,
    vida            INTEGER DEFAULT 100,
    vida_max        INTEGER DEFAULT 100,
    forca           INTEGER DEFAULT 10,
    destreza        INTEGER DEFAULT 10,
    inteligencia    INTEGER DEFAULT 10,
    carisma         INTEGER DEFAULT 10,
    constituicao    INTEGER DEFAULT 10,
    sabedoria       INTEGER DEFAULT 10,
    descricao_visual TEXT,
    avatar_url      TEXT,
    inventario      TEXT    DEFAULT '[]',
    criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Tabela de Salas (sessões de jogo)
CREATE TABLE IF NOT EXISTS salas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    tema        TEXT    NOT NULL,
    codigo      TEXT    NOT NULL UNIQUE,
    host_id     INTEGER NOT NULL,
    lore        TEXT,
    objetivo    TEXT,
    ativa       INTEGER DEFAULT 1,
    criada_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Tabela de Mapas/Cenários (locais do mundo gerado)
CREATE TABLE IF NOT EXISTS mapas_cenarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sala_id         INTEGER NOT NULL,
    nome            TEXT    NOT NULL,
    descricao       TEXT    NOT NULL,
    imagem_url      TEXT,
    ordem           INTEGER DEFAULT 0,
    mapa_atual      INTEGER DEFAULT 0,
    criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sala_id) REFERENCES salas(id) ON DELETE CASCADE
);

-- Tabela de Mensagens (histórico do chat/narrativa)
CREATE TABLE IF NOT EXISTS mensagens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sala_id         INTEGER NOT NULL,
    usuario_id      INTEGER,
    personagem_id   INTEGER,
    tipo            TEXT    NOT NULL DEFAULT 'acao',
    conteudo        TEXT    NOT NULL,
    criada_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sala_id)       REFERENCES salas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (personagem_id) REFERENCES personagens(id) ON DELETE SET NULL
);

-- Tabela de Jogadores na Sala (relação N:N entre salas e personagens)
CREATE TABLE IF NOT EXISTS sala_jogadores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sala_id         INTEGER NOT NULL,
    personagem_id   INTEGER NOT NULL,
    entrou_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sala_id)       REFERENCES salas(id) ON DELETE CASCADE,
    FOREIGN KEY (personagem_id) REFERENCES personagens(id) ON DELETE CASCADE,
    UNIQUE(sala_id, personagem_id)
);
