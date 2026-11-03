const { ErroAplicacao } = require('../services/erroAplicacao');

function origemPermitida(requisicao) {
    const origem = requisicao.headers.origin;
    if (!origem) return true;
    try {
        const url = new URL(origem);
        const protocolo = requisicao.socket.encrypted ? 'https:' : 'http:';
        return url.origin === `${protocolo}//${requisicao.headers.host}`;
    } catch { return false; }
}

class Limitador {
    constructor({ agora = () => Date.now() } = {}) { this.registros = new Map(); this.agora = agora; }

    consumir(chave, limite, janela) {
        const agora = this.agora();
        for (const [id, registro] of this.registros) if (registro.ate <= agora) this.registros.delete(id);
        let registro = this.registros.get(chave);
        if (!registro) {
            if (this.registros.size >= 10000) throw new ErroAplicacao(429, 'LIMITE_REQUISICOES', 'Muitas requisições. Tente novamente mais tarde.');
            registro = { quantidade: 0, ate: agora + janela }; this.registros.set(chave, registro);
        }
        if (++registro.quantidade > limite) throw new ErroAplicacao(429, 'LIMITE_REQUISICOES', 'Muitas requisições. Tente novamente mais tarde.');
    }
}

module.exports = { origemPermitida, Limitador };
