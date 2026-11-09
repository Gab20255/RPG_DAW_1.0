const { DatabaseSync: BancoSqlite } = require('node:sqlite');
const arquivos = require('node:fs');
const caminhos = require('node:path');
const { RAIZ } = require('../terminal/arquivos');
const { parse: interpretarEnv } = require('dotenv');

function caminhoBanco() {
    let configuracao = {};
    try { configuracao = interpretarEnv(arquivos.readFileSync(caminhos.join(RAIZ, '.env'))); }
    catch (erro) { if (erro.code !== 'ENOENT') throw erro; }
    return caminhos.resolve(RAIZ, configuracao.DATABASE_PATH || process.env.DATABASE_PATH || 'database/rpg.db');
}

class BancoDados {
    constructor(arquivo = caminhoBanco()) {
        if (arquivo !== ':memory:') arquivos.mkdirSync(caminhos.dirname(caminhos.resolve(arquivo)), { recursive: true });
        this.conexao = new BancoSqlite(arquivo, { enableForeignKeyConstraints: true, timeout: 5000 });
        try {
            this.conexao.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
            this.transacao(() => {
                this.conexao.exec(arquivos.readFileSync(caminhos.join(RAIZ, 'database/schema.sql'), 'utf8'));
            });
        } catch (erro) { this.conexao.close(); throw erro; }
    }

    obter(sql, ...parametros) { return this.conexao.prepare(sql).get(...parametros); }
    listar(sql, ...parametros) { return this.conexao.prepare(sql).all(...parametros); }
    executar(sql, ...parametros) { return this.conexao.prepare(sql).run(...parametros); }

    transacao(tarefa) {
        this.conexao.exec('BEGIN IMMEDIATE');
        try {
            const resultado = tarefa();
            if (resultado && typeof resultado.then === 'function') throw new Error('Transações do banco devem ser síncronas.');
            this.conexao.exec('COMMIT');
            return resultado;
        } catch (erro) { this.conexao.exec('ROLLBACK'); throw erro; }
    }

    fechar() { this.conexao.close(); }
}

module.exports = { BancoDados };
