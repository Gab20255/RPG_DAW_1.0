const { randomUUID, randomInt } = require('node:crypto');
const { validarPersonagem, ATRIBUTOS } = require('./personagemService');
const { REGRAS } = require('../rules/habilidades');
const { hashMundo } = require('../terminal/arquivos');
const { validarNarracao } = require('../prompts/mestrePrompt');

function criarPartida(ficha, mundo) {
    const personagem = validarPersonagem(ficha, mundo);
    if (ficha.mundo_hash !== hashMundo(mundo)) throw new Error('O mundo foi alterado desde a criação da ficha. Selecione o JSON original ou recrie o personagem.');
    return { versao: '1.0', mundo_hash: ficha.mundo_hash, personagem, ambiente_id: mundo.mundo.ambiente_inicial_id, eventos: [] };
}

function registrarAcao(estado, mundo, entrada, rolar = () => randomInt(1, 21)) {
    if (typeof entrada !== 'string' || !entrada.trim() || entrada.length > 1000) throw new Error('Use uma ação entre 1 e 1.000 caracteres.');
    const proximo = structuredClone(estado);
    let tipo = 'intencao';
    let resumo = 'Intenção recebida. Nenhum efeito mecânico foi autorizado; não resolva ações que dependam de regras ausentes.';
    let teste = null;
    const local = mundo.ambientes.find((item) => item.id === estado.ambiente_id);
    if (!local) throw new Error('Cena atual inválida.');
    if (entrada.startsWith('/ir ')) {
        const numero = entrada.slice(4).trim();
        const destinoId = /^\d+$/.test(numero) ? local.conexoes_ids[Number(numero) - 1] : null;
        const destino = mundo.ambientes.find((item) => item.id === destinoId);
        if (!destino) throw new Error('Destino inválido. Use /locais para ver as conexões permitidas.');
        proximo.ambiente_id = destino.id;
        tipo = 'transicao';
        resumo = `Transição confirmada pelo código: de ${local.nome} para ${destino.nome}. Nenhum outro efeito foi autorizado.`;
    } else if (entrada.startsWith('/teste ')) {
        const partes = entrada.match(/^\/teste\s+(\S+)\s+(.+)$/);
        if (!partes || !ATRIBUTOS.includes(partes[1])) throw new Error(`Use /teste <${ATRIBUTOS.join('|')}> <descrição>.`);
        const dado = rolar();
        if (!Number.isInteger(dado) || dado < 1 || dado > 20) throw new Error('Rolagem inválida.');
        const bonus = Math.floor((estado.personagem.atributos[partes[1]] - 10) / 2);
        teste = { atributo: partes[1], descricao: partes[2], d20: dado, bonus, total: dado + bonus, dificuldade: 12, sucesso: dado + bonus >= 12 };
        tipo = 'teste';
        resumo = `Teste de ${teste.atributo}: ${teste.sucesso ? 'SUCESSO' : 'FALHA'} (D20 ${dado} + bônus ${bonus} = ${teste.total}; dificuldade 12). Narre esse resultado, sem aplicar vida, itens ou efeitos adicionais.`;
    } else if (entrada === '/observar') {
        tipo = 'observacao'; resumo = 'Observação autorizada do cenário atual. Descreva somente informações conhecidas, sem revelar segredos.';
    } else if (entrada.startsWith('/falar ')) {
        tipo = 'dialogo'; resumo = 'Diálogo autorizado com NPCs presentes. Não assuma decisões do jogador ou vantagens mecânicas.';
    } else if (entrada.startsWith('/')) throw new Error('Comando desconhecido. Use /ajuda.');
    const resultado = { id: randomUUID(), personagem_id: estado.personagem.id, ambiente_id: proximo.ambiente_id, tipo, acao: entrada,
        resumo, teste, alteracoes: tipo === 'transicao' ? { ambiente_id: proximo.ambiente_id } : {}, narracao: null };
    proximo.eventos.push(resultado);
    return proximo;
}

function montarContexto(estado, mundo) {
    const ambiente = mundo.ambientes.find((item) => item.id === estado.ambiente_id);
    const resultado = estado.eventos.at(-1);
    if (!ambiente || !resultado) throw new Error('Registre uma ação oficial antes de montar o contexto.');
    const p = estado.personagem;
    return structuredClone({
        versao_regras: REGRAS.versao,
        mundo: { nome: mundo.mundo.nome, tema: mundo.mundo.tema, tom: mundo.mundo.tom, regras: mundo.mundo.regras_do_universo,
            resumo: mundo.historia.situacao_atual, objetivo: mundo.historia.objetivo_principal },
        limites_conteudo: ['Ambiente escolar', 'Sem violência gráfica', 'Sem conteúdo sexual explícito', 'Sem discriminação ou humilhação'],
        personagem: { id: p.id, nome: p.nome, classe: p.classe, raca: p.raca, descricao_visual: p.descricao_visual, nivel: p.nivel,
            vida: p.vida, vida_max: p.vida_max, energia: p.energia, energia_max: p.energia_max, atributos: p.atributos,
            inventario: p.inventario.map(({ id, nome, descricao }) => ({ id, nome, descricao })), habilidades: p.habilidades },
        cena: { id: ambiente.id, nome: ambiente.nome, descricao: ambiente.descricao,
            conexoes: ambiente.conexoes_ids.map((id) => ({ id, nome: mundo.ambientes.find((local) => local.id === id)?.nome })),
            npcs: mundo.personagens.filter((npc) => npc.ambiente_id === ambiente.id).slice(0, 8).map(({ id, nome, descricao, personalidade, aparencia }) => ({ id, nome, descricao, personalidade, aparencia })) },
        historico_confirmado: estado.eventos.slice(-7, -1).map((evento) => ({ id: evento.id, resultado: evento.resumo, narracao: evento.narracao?.narracao || null })),
        resultado: { id: resultado.id, tipo: resultado.tipo, personagem_id: resultado.personagem_id, ambiente_id: resultado.ambiente_id,
            acao: resultado.acao, resumo: resultado.resumo, teste: resultado.teste, alteracoes: resultado.alteracoes },
    });
}

async function narrarPendente(estado, mundo, servico) {
    const evento = estado.eventos.at(-1);
    if (!evento) throw new Error('Nenhum resultado pendente.');
    const contexto = montarContexto(estado, mundo);
    if (evento.narracao) { validarNarracao(evento.narracao, contexto); return structuredClone(estado); }
    const resposta = validarNarracao(await servico.narrarResultado(contexto), contexto);
    const proximo = structuredClone(estado);
    proximo.eventos.at(-1).narracao = resposta;
    return proximo;
}

module.exports = { criarPartida, registrarAcao, montarContexto, narrarPendente };
