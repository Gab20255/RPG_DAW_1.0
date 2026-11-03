const { BASES_RPG } = require('../data/basesRpg');
const { validarMundo } = require('../prompts/mundoPrompt');
const { calcularAtributos } = require('./personagemService');
const { prepararAbertura } = require('./adaptacaoBaseService');

function validarPedidoBase(pedido) {
    if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido)) throw new Error('Pedido de RPG inválido.');
    const validado = {};
    for (const [campo, minimo, maximo] of [['titulo', 2, 80], ['historia', 5, 2000], ['tom', 0, 1000]]) {
        const valor = pedido[campo];
        if (typeof valor !== 'string' || valor.trim().length < minimo || valor.trim().length > maximo) throw new Error(`Campo ${campo} inválido (${minimo}–${maximo} caracteres).`);
        validado[campo] = valor.trim();
    }
    return validado;
}

function listarBases() {
    return BASES_RPG.map(({ id, nome, descricao }) => ({ id, nome, descricao }));
}

function normalizar(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function selecionarBaseLocal(pedido) {
    const validado = validarPedidoBase(pedido);
    const campos = [['historia', 4], ['titulo', 2], ['tom', 1]];
    const pontuacoes = BASES_RPG.map(base => ({
        id: base.id,
        pontos: campos.reduce((total, [campo, peso]) => {
            const texto = ` ${normalizar(validado[campo])} `;
            return total + base.palavras_chave.reduce((soma, palavra) => soma + (texto.includes(` ${normalizar(palavra)} `) ? peso : 0), 0);
        }, 0),
    }));
    return pontuacoes.sort((primeira, segunda) => segunda.pontos - primeira.pontos)[0].id;
}

function criarMundoDaBase(pedido, identificador, selecao = 'local', motivo = null) {
    const premissa = validarPedidoBase(pedido);
    const base = BASES_RPG.find(opcao => opcao.id === identificador);
    if (!base) throw new Error('Base de RPG desconhecida.');
    const mundo = structuredClone(base.mundo);
    mundo.mundo.nome = premissa.titulo;
    mundo.mundo.tema = premissa.historia;
    mundo.mundo.tom = premissa.tom || base.mundo.mundo.tom;
    mundo.historia.passado = premissa.historia;
    mundo.premissa = premissa;
    mundo.origem = { tipo: 'base_pronta', base_id: base.id, base_nome: base.nome, versao_base: base.versao, selecao, motivo_local: motivo };
    mundo.classes.forEach(calcularAtributos);
    return validarMundo(mundo);
}

async function iniciarMundoPorBase(pedido, consultarBase, consultarAdaptacao) {
    const premissa = validarPedidoBase(pedido);
    let identificador;
    let selecao = 'local';
    let motivo = 'Seleção local sem consulta à IA.';
    if (consultarBase) {
        try {
            identificador = await consultarBase(premissa, listarBases());
            if (!BASES_RPG.some(base => base.id === identificador)) {
                const erro = new Error('Base retornada pela IA inválida.');
                erro.code = 'BASE_INVALIDA';
                throw erro;
            }
            selecao = 'ia';
            motivo = null;
        } catch (erro) {
            if (['CANCELADO', 'ENTRADA_ENCERRADA'].includes(erro.code) || erro instanceof ReferenceError) throw erro;
            motivo = erro.code === 'BASE_INVALIDA' ? 'Resposta da IA inválida.' : 'Seleção por IA indisponível.';
        }
    }
    const mundo = criarMundoDaBase(premissa, selecao === 'ia' ? identificador : selecionarBaseLocal(premissa), selecao, motivo);
    return prepararAbertura(mundo, selecao === 'ia' ? consultarAdaptacao : null);
}

module.exports = { listarBases, validarPedidoBase, selecionarBaseLocal, criarMundoDaBase, iniciarMundoPorBase };
