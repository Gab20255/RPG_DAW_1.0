const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { BancoDados } = require('../src/repositorios/bancoDados');

test('migra banco antigo sem perder dados e pode reabrir sem reaplicar alterações', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-migracao-'));
    const arquivo = path.join(pasta, 'antigo.db');
    let banco;
    try {
        const antigo = new DatabaseSync(arquivo);
        const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8')
            .split('\n').filter(linha => !/^\s*(etapa|iniciada_em|revisao_preparacao|pronto)\s/.test(linha)).join('\n');
        antigo.exec(schema);
        antigo.exec(`INSERT INTO usuarios(id,username,email,senha_hash) VALUES (1,'antigo','antigo@example.com','hash');
            INSERT INTO salas(id,nome,tema,codigo,host_id) VALUES (1,'Campanha antiga','Floresta','1111111111111111',1),(2,'Lobby antigo','Floresta','2222222222222222',1);
            INSERT INTO sala_membros(sala_id,usuario_id) VALUES(1,1),(2,1);
            INSERT INTO campanhas(id,dono_id,mundo_json) VALUES ('antiga',1,'{"campanha":{"turno":3,"pendente":null,"estado":"em_andamento"}}');
            INSERT INTO salas_campanhas(sala_id,campanha_id) VALUES (1,'antiga');
            INSERT INTO personagens(usuario_id,nome,classe) VALUES (1,'Personagem preservado','Guardião');`);
        antigo.close();
        banco = new BancoDados(arquivo);
        assert.equal(banco.obter('SELECT etapa FROM salas WHERE id=1').etapa, 'em_andamento');
        assert.equal(banco.obter('SELECT etapa FROM salas WHERE id=2').etapa, 'preparacao');
        assert.equal(banco.obter('SELECT pronto FROM sala_membros WHERE sala_id=2').pronto, 0);
        assert.equal(banco.obter('SELECT nome FROM personagens').nome, 'Personagem preservado');
        assert.equal(banco.obter('SELECT COUNT(*) AS total FROM migracoes').total, 2);
        banco.fechar(); banco = new BancoDados(arquivo);
        assert.equal(banco.obter('SELECT COUNT(*) AS total FROM usuarios').total, 1);
        assert.equal(banco.obter('SELECT COUNT(*) AS total FROM migracoes').total, 2);
    } finally {
        banco?.fechar();
        const relativa = path.relative(os.tmpdir(), pasta);
        assert.ok(!path.isAbsolute(relativa) && !relativa.startsWith('..') && path.basename(pasta).startsWith('rpg-migracao-'));
        fs.rmSync(pasta, { recursive: true, force: true });
    }
});

test('banco novo contém as colunas de preparação e restrições', () => {
    const banco = new BancoDados(':memory:');
    try {
        assert.ok(banco.listar('PRAGMA table_info(salas)').some(c => c.name === 'etapa'));
        assert.ok(banco.listar('PRAGMA table_info(sala_membros)').some(c => c.name === 'pronto'));
        assert.equal(banco.obter('PRAGMA foreign_keys').foreign_keys, 1);
    } finally { banco.fechar(); }
});
