const { LIMITE_CONTEXTO } = require('../rules/narrativa');
const { obterMundoCampanha } = require('./campanhaService');
const { descreverTeste } = require('../rules/testes');

function palavras(texto) {
    return new Set(texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{4,}/g) || []);
}

function selecionarRelevantes(registros, consulta, limite) {
    const termos = palavras(consulta);
    return registros.map((registro, indice) => {
        const conteudo = palavras(registro.texto || registro.acao || registro.descricao || '');
        const correspondencias = [...termos].filter(termo => conteudo.has(termo)).length;
        return { registro, pontuacao: correspondencias * 10 + (indice + 1) / Math.max(1, registros.length) };
    }).sort((primeiro, segundo) => segundo.pontuacao - primeiro.pontuacao).slice(0, limite).map(item => structuredClone(item.registro));
}

function montarContextoCampanha(mundo, campanha) {
    if (!campanha.pendente) throw new Error('Nenhuma cena pendente.');
    const atual = obterMundoCampanha(mundo, campanha);
    const pedido = campanha.pendente;
    const participantes = campanha.participantes || [];
    const autor = participantes.find(item => item.id === pedido.participante_id);
    const local = atual.ambientes.find(item => item.id === pedido.ambiente_id);
    if (!local) throw new Error('Cena inexistente.');
    const consulta = `${pedido.acao} ${local.nome}`;
    const memoria = Object.fromEntries(['fatos', 'pistas', 'decisoes', 'acontecimentos'].map(tipo => [tipo,
        selecionarRelevantes(campanha.memoria[tipo], consulta, tipo === 'fatos' ? 14 : tipo === 'pistas' ? 8 : 4),
    ]));
    const recentes = campanha.diario.slice(-2);
    const antiga = selecionarRelevantes(campanha.diario.slice(0, -2), pedido.acao, 1);
    const contexto = {
        campanha_id: campanha.id,
        premissa: {
            titulo: mundo.mundo.nome.slice(0, 80), historia: (mundo.premissa?.historia || mundo.mundo.tema).slice(0, 2000), tom: mundo.mundo.tom.slice(0, 500),
        },
        direcao: campanha.direcao, direcao_definida: campanha.direcao_definida, resumo: campanha.resumo,
        participantes: participantes.slice(0, 8).map(({ id, ficha }) => ({ id, personagem_id: ficha.id, nome: ficha.nome, classe: ficha.classe.slice(0, 80) })),
        quantidade_participantes: participantes.length,
        autor: autor ? { participante_id: autor.id, personagem_id: autor.ficha.id, nome: autor.ficha.nome,
            classe: autor.ficha.classe.slice(0, 80), raca: autor.ficha.raca.slice(0, 80), descricao_visual: autor.ficha.descricao_visual.slice(0, 240),
            nivel: autor.ficha.nivel, atributos: autor.ficha.atributos, vida: autor.ficha.vida, vida_max: autor.ficha.vida_max,
            energia: autor.ficha.energia, energia_max: autor.ficha.energia_max,
            inventario: autor.ficha.inventario.slice(0, 5).map(({ id, nome }) => ({ id, nome: nome.slice(0, 80) })),
            habilidades: autor.ficha.habilidades.map(({ id, nome, custoRecurso, limitacao }) => ({ id, nome, custo: custoRecurso, limitacao })),
        } : null,
        resultado_oficial: pedido.teste ? { pedido_id: pedido.id, participante_id: pedido.participante_id,
            personagem_id: pedido.personagem_id, teste: pedido.teste, resumo: descreverTeste(pedido.teste), alteracoes: {} } : null,
        cena: {
            id: local.id, nome: local.nome.slice(0, 80), descricao: local.descricao.slice(0, 700),
            conexoes: local.conexoes_ids.slice(0, 12).map(id => { const destino = atual.ambientes.find(item => item.id === id); return { id, nome: destino.nome.slice(0, 80) }; }),
            npcs: atual.personagens.filter(item => item.ambiente_id === local.id).slice(0, 6).map(({ id, nome, descricao, motivacao }) => ({ id, nome: nome.slice(0, 80), descricao: descricao.slice(0, 240), motivacao: motivacao.slice(0, 160) })),
            criaturas: atual.criaturas.filter(item => item.ambientes_ids.includes(local.id)).slice(0, 3).map(({ id, nome, comportamento }) => ({ id, nome: nome.slice(0, 80), comportamento: comportamento.slice(0, 200) })),
            itens: campanha.conteudo.itens.filter(item => item.ambiente_id === local.id).slice(-4).map(({ id, nome, descricao }) => ({ id, nome, descricao })),
        },
        memoria,
        objetivos: [campanha.objetivos.find(item => item.id === 'objetivo_principal'), ...selecionarRelevantes(campanha.objetivos.filter(item => item.id !== 'objetivo_principal'), consulta, 6)],
        historico_recente: [...recentes].reverse().concat(antiga).map(({ turno, acao, narracao, participante_id, teste }) => ({ turno, participante_id: participante_id || null, acao: acao.slice(0, 300), narracao: narracao.slice(0, 600), teste: teste ? { ...teste, descricao: teste.descricao.slice(0, 300) } : null })),
        pedido: { id: pedido.id, turno: pedido.turno, acao: pedido.acao, tipo: pedido.tipo, ambiente_id: pedido.ambiente_id,
            participante_id: pedido.participante_id || null, personagem_id: pedido.personagem_id || null },
        regras: {
            participantes: autor ? 'A ação pertence exclusivamente ao autor identificado. As demais fichas não autorizaram ações voluntárias.' : 'Ação coletiva sem ficha; não invente identidade ou poderes.',
            resolucao: pedido.teste ? 'O D20 já foi resolvido. Narre o sucesso ou falha informado, sem rolar novamente ou conceder vida, dano, itens ou poderes. Outros efeitos continuam sem autorização.' : pedido.tipo === 'transicao' ? 'Deslocamento do grupo autorizado pelo código para a cena indicada.' : 'Diálogo e exploração narrativa permitidos; resultados de combate, dados, atributos e inventário não foram autorizados.',
        },
    };
    const listas = [memoria.fatos, memoria.pistas, memoria.decisoes, memoria.acontecimentos, contexto.historico_recente, contexto.cena.npcs, contexto.cena.criaturas, contexto.cena.itens, contexto.cena.conexoes, contexto.participantes];
    while (JSON.stringify(contexto).length > LIMITE_CONTEXTO) {
        const lista = listas.filter(itens => itens.length > 1).sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
        if (lista) lista.pop();
        else if (contexto.objetivos.length > 1) contexto.objetivos.pop();
        else {
            const restante = listas.filter(itens => itens.length).sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
            if (!restante) throw new Error('Contexto da campanha excede o limite.');
            restante.pop();
        }
    }
    return structuredClone(contexto);
}

module.exports = { montarContextoCampanha, selecionarRelevantes };
