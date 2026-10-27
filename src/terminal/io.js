const readline = require('node:readline');

class Cancelamento extends Error {
    constructor() { super('Operação cancelada. Nenhum personagem novo foi salvo.'); this.code = 'CANCELADO'; }
}

// O iterador preserva respostas ja recebidas, inclusive em entrada por pipe.
function criarTerminal({ input = process.stdin, output = process.stdout } = {}) {
    const rl = readline.createInterface({ input, crlfDelay: Infinity, terminal: Boolean(input.isTTY && output.isTTY) });
    const linhas = rl[Symbol.asyncIterator]();
    rl.on('SIGINT', () => rl.close());
    return {
        escrever: (texto = '') => output.write(`${texto}\n`),
        async perguntar(pergunta) {
            output.write(pergunta);
            const proxima = await linhas.next();
            if (proxima.done || proxima.value.trim().toLowerCase() === '/sair') throw new Cancelamento();
            return proxima.value.trim();
        },
        fechar: () => rl.close(),
    };
}

async function escolher(terminal, mensagem, opcoes) {
    if (!opcoes.length) throw new Error('Nenhuma opção disponível.');
    terminal.escrever(`\n${mensagem}`);
    opcoes.forEach((opcao, i) => terminal.escrever(`  ${i + 1}. ${opcao.rotulo}`));
    while (true) {
        const resposta = await terminal.perguntar('Número da opção: ');
        const indice = /^\d+$/.test(resposta) ? Number(resposta) - 1 : -1;
        if (opcoes[indice]) return opcoes[indice].valor;
        terminal.escrever('Opção inválida. Escolha um dos números listados.');
    }
}

async function perguntarTexto(terminal, mensagem, min, max) {
    while (true) {
        const resposta = await terminal.perguntar(mensagem);
        if (resposta.length >= min && resposta.length <= max) return resposta;
        terminal.escrever(`Use entre ${min} e ${max} caracteres.`);
    }
}

module.exports = { criarTerminal, escolher, perguntarTexto, Cancelamento };
