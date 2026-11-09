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
    etapa       TEXT NOT NULL DEFAULT 'preparacao' CHECK(etapa IN ('preparacao', 'em_andamento')),
    iniciada_em TEXT,
    revisao_preparacao INTEGER NOT NULL DEFAULT 0 CHECK(revisao_preparacao >= 0),
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

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_normalizado ON usuarios(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalizado ON usuarios(lower(email));

CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_expiracao ON sessoes(expira_em);

CREATE TABLE IF NOT EXISTS campanhas (
    id TEXT PRIMARY KEY,
    dono_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    mundo_json TEXT NOT NULL CHECK(json_valid(mundo_json)),
    revisao INTEGER NOT NULL DEFAULT 0,
    criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS salas_campanhas (
    sala_id INTEGER PRIMARY KEY REFERENCES salas(id) ON DELETE CASCADE,
    campanha_id TEXT NOT NULL UNIQUE REFERENCES campanhas(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sala_membros (
    sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    entrou_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pronto INTEGER NOT NULL DEFAULT 0 CHECK(pronto IN (0, 1)),
    PRIMARY KEY(sala_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS fichas_campanha (
    campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    personagem_id INTEGER NOT NULL UNIQUE REFERENCES personagens(id) ON DELETE RESTRICT,
    participante_id TEXT NOT NULL,
    PRIMARY KEY(campanha_id, usuario_id),
    UNIQUE(campanha_id, participante_id)
);

CREATE TABLE IF NOT EXISTS cenas_mensagens (
    campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
    cena_id TEXT NOT NULL,
    acao_id INTEGER NOT NULL UNIQUE REFERENCES mensagens(id) ON DELETE CASCADE,
    narracao_id INTEGER NOT NULL UNIQUE REFERENCES mensagens(id) ON DELETE CASCADE,
    PRIMARY KEY(campanha_id, cena_id)
);

CREATE TABLE IF NOT EXISTS ambientes_mapas (
    campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
    ambiente_id TEXT NOT NULL,
    mapa_id INTEGER NOT NULL UNIQUE REFERENCES mapas_cenarios(id) ON DELETE CASCADE,
    PRIMARY KEY(campanha_id, ambiente_id)
);
