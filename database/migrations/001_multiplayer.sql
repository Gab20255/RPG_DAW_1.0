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
