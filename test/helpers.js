const { BancoDados } = require('../src/repositorios/bancoDados');
const { criarAplicacao } = require('../src/http/aplicacao');
const { iniciarServidor } = require('../src/servidor');

function servicoTeste() {
    const falhas = new Set();
    return {
        async selecionarBase() { throw new Error('Teste usa base local.'); },
        async continuarCampanha(contexto) {
            const { pedido } = contexto;
            if (pedido.acao.includes('falha429') && !falhas.has(pedido.id)) {
                falhas.add(pedido.id); throw Object.assign(new Error('Limite simulado'), { status: 429 });
            }
            return {
                pedido_id: pedido.id, turno: pedido.turno, ambiente_id: pedido.ambiente_id,
                narracao: `O grupo observa ${contexto.cena.nome}. A passagem permanece aberta e a história continua.`,
                resumo: `O grupo está em ${contexto.cena.nome}.`,
                direcao: contexto.direcao_definida ? [] : [contexto.direcao],
                fatos: [], pistas: [], acontecimentos: [], objetivos: [],
                novidades: { locais: [], npcs: [], criaturas: [], itens: [], missoes: [] },
                exige_resolucao_mecanica: false, encerramento: { concluir: false, desfecho: '' },
            };
        },
    };
}
async function ambienteTeste(porta = 0) {
    const banco = new BancoDados(':memory:');
    const service = servicoTeste();
    let rolagens = 0;
    const app = criarAplicacao({ banco, criarServico: () => service, rolar: () => { rolagens++; return 14; } });
    const server = await iniciarServidor({ porta, aplicacao: app });
    return { banco, app, server, url: `http://127.0.0.1:${server.address().port}`, rolagens: () => rolagens,
        fechar: async () => { await new Promise(resolve => server.tempoReal.close(resolve)); banco.fechar(); } };
}
function cliente(url) {
    let cookie = '';
    return { cookie: () => cookie, async request(path, body) {
        const response = await fetch(`${url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        const data = response.status === 204 ? null : await response.json();
        return { status: response.status, data };
    } };
}
module.exports = { ambienteTeste, cliente };
