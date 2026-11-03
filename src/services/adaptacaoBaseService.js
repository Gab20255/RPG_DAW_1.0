const { validarMundo } = require('../prompts/mundoPrompt');

function criarContextoAdaptacao(mundo) {
    return {
        base: mundo.origem.base_nome, ambiente_inicial_id: mundo.mundo.ambiente_inicial_id,
        ...Object.fromEntries(['classes', 'personagens', 'ambientes'].map(colecao => [colecao,
            mundo[colecao].map(({ id, nome, descricao }) => ({ id, nome, descricao })),
        ])),
    };
}

function validarCampos(objeto, campos) {
    if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto) || Object.keys(objeto).length !== campos.length || campos.some(campo => !Object.hasOwn(objeto, campo))) {
        throw new Error('Campos da adaptação inválidos.');
    }
}

function validarTexto(valor, limite) {
    if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > limite) throw new Error('Texto da adaptação inválido.');
}

function aplicarAdaptacaoBase(mundo, resposta) {
    validarCampos(resposta, ['historia_inicial', 'classes', 'personagens', 'ambientes']);
    validarTexto(resposta.historia_inicial, 2400);
    const renomeacoes = new Map();
    for (const colecao of ['classes', 'personagens', 'ambientes']) {
        const lista = resposta[colecao];
        if (!Array.isArray(lista) || lista.length !== mundo[colecao].length) throw new Error(`Quantidade inválida: ${colecao}.`);
        const ids = new Set();
        const nomes = new Set();
        for (const item of lista) {
            validarCampos(item, colecao === 'classes' ? ['id', 'nome'] : ['id', 'nome', 'descricao']);
            const original = mundo[colecao].find(entidade => entidade.id === item.id);
            if (!original || ids.has(item.id)) throw new Error(`Identidade inválida: ${colecao}.`);
            validarTexto(item.nome, 60);
            const nome = item.nome.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
            if (nomes.has(nome)) throw new Error(`Nome repetido: ${colecao}.`);
            if (colecao !== 'classes') validarTexto(item.descricao, 240);
            ids.add(item.id);
            nomes.add(nome);
            renomeacoes.set(original.nome, item.nome.trim());
        }
    }
    const adaptado = structuredClone(mundo);
    const padrao = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...renomeacoes.keys()].sort((a, b) => b.length - a.length).map(nome => nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
    const substituirNomes = texto => texto.replace(padrao, nome => renomeacoes.get(nome));
    for (const colecao of ['classes', 'personagens', 'ambientes', 'faccoes', 'itens', 'criaturas', 'missoes']) {
        for (const item of adaptado[colecao]) {
            for (const [campo, valor] of Object.entries(item)) {
                if (campo === 'id' || /_ids?$/.test(campo) || campo === 'nome') continue;
                if (typeof valor === 'string') item[campo] = substituirNomes(valor);
                else if (Array.isArray(valor) && valor.every(texto => typeof texto === 'string')) item[campo] = valor.map(substituirNomes);
            }
        }
    }
    for (const colecao of ['classes', 'personagens', 'ambientes']) {
        for (const item of resposta[colecao]) {
            const destino = adaptado[colecao].find(entidade => entidade.id === item.id);
            destino.nome = item.nome.trim();
            if (colecao !== 'classes') {
                destino.descricao = item.descricao.trim();
                destino.prompt_imagem = `${destino.nome}. ${destino.descricao}`;
            }
        }
    }
    adaptado.historia.preludio = resposta.historia_inicial.trim();
    adaptado.historia.situacao_atual = resposta.historia_inicial.trim();
    adaptado.preparacao = { etapa: 'historia_inicial', proxima_etapa: 'participantes', adaptacao: 'ia', motivo_local: null };
    return validarMundo(adaptado);
}

async function prepararAbertura(mundo, consultarAdaptacao) {
    let motivo = 'Abertura local sem consulta à IA.';
    if (consultarAdaptacao) {
        try {
            const resposta = await consultarAdaptacao(structuredClone(mundo.premissa), criarContextoAdaptacao(mundo));
            return aplicarAdaptacaoBase(mundo, resposta);
        } catch (erro) {
            if (['CANCELADO', 'ENTRADA_ENCERRADA'].includes(erro.code) || erro instanceof ReferenceError) throw erro;
            motivo = 'Adaptação indisponível ou inválida; base preservada.';
        }
    }
    const local = structuredClone(mundo);
    local.historia.preludio = `${local.premissa.historia}\n\n${local.historia.preludio}`;
    local.preparacao = { etapa: 'historia_inicial', proxima_etapa: 'participantes', adaptacao: 'local', motivo_local: motivo };
    return validarMundo(local);
}

module.exports = { criarContextoAdaptacao, aplicarAdaptacaoBase, prepararAbertura };
