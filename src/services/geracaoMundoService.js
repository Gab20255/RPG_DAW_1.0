const { isDeepStrictEqual: saoIguais } = require('node:util');
const { CATALOGO, obterAgentes, criarPlanejamento, criarContratoAgente } = require('../prompts/agentesMundoPrompt');
const { validarMundo } = require('../prompts/mundoPrompt');
const { calcularAtributos } = require('./personagemService');
const { QUANTIDADES_CAMPANHA, TOTAL_CAPITULOS, TOTAL_GANCHOS, MODELO_CAPITULO } = require('../rules/campanha');
const { criarFilaConcorrente } = require('./concorrencia');
const { prepararMundo } = require('./planejamentoMundoService');
const { completarRelacoes } = require('./relacoesMundoService');
const { normalizarResposta, executarComCorrecao } = require('./correcaoMundoService');
const { gerarCapitulos } = require('./capitulosService');

function criarGeracao(pedido, { perfil = 'campanha' } = {}) {
    if (typeof pedido !== 'string' || !pedido.trim() || pedido.length > 12000) throw new Error('Pedido de mundo inválido.');
    return { tipo: 'geracao_mundo', versao: '1.0', perfil, pedido, etapas: {}, partes: {}, tamanhos_lote: {} };
}

function obterDependencias(agente, geracao) {
    const dependencias = {
        mundo: [], historia: ['mundo'], racas: ['historia'], faccoes: ['historia'], ambientes: ['racas', 'faccoes'],
        itens: ['ambientes'], classes: ['itens', 'racas', 'faccoes'], personagens: ['ambientes', 'faccoes'],
        criaturas: ['ambientes', 'racas'], missoes: ['classes', 'personagens', 'criaturas', 'itens'],
        capitulos: ['missoes'], ganchos: [geracao.perfil === 'campanha' ? 'capitulos' : 'missoes'],
        revisao: obterAgentes(geracao).filter(item => item.id !== 'revisao').map(item => item.id),
    };
    return dependencias[agente.id];
}

function validarGeracao(geracao) {
    if (!geracao || geracao.tipo !== 'geracao_mundo' || geracao.versao !== '1.0' || !geracao.etapas || typeof geracao.etapas !== 'object' || Array.isArray(geracao.etapas)) throw new Error('Geração inválida.');
    criarGeracao(geracao.pedido);
    if (geracao.perfil && !['compacto', 'campanha'].includes(geracao.perfil)) throw new Error('Perfil de geração inválido.');
    const agentes = obterAgentes(geracao);
    if (Object.hasOwn(geracao.etapas, 'ambientes_itens')) {
        if (Object.hasOwn(geracao.etapas, 'ambientes') || Object.hasOwn(geracao.etapas, 'itens')) throw new Error('Etapas de ambientes e itens conflitantes.');
        const anterior = geracao.etapas.ambientes_itens;
        if (!anterior || !Array.isArray(anterior.ambientes) || !Array.isArray(anterior.itens)) throw new Error('Etapa antiga inválida.');
        geracao.etapas.ambientes = { ambientes: anterior.ambientes };
        geracao.etapas.itens = { itens: anterior.itens };
        delete geracao.etapas.ambientes_itens;
    }
    geracao.partes ??= {};
    geracao.tamanhos_lote ??= {};
    geracao.pendencias ??= {};
    if (!geracao.pendencias || typeof geracao.pendencias !== 'object' || Array.isArray(geracao.pendencias)) throw new Error('Pendências da geração inválidas.');
    if (geracao.fragmentos_capitulos !== undefined && (!geracao.fragmentos_capitulos || typeof geracao.fragmentos_capitulos !== 'object' || Array.isArray(geracao.fragmentos_capitulos)
        || Object.keys(geracao.fragmentos_capitulos).some(id => !/^capitulo_[1-6]$/.test(id)))) throw new Error('Fragmentos de capítulos inválidos.');
    for (const campo of ['partes', 'tamanhos_lote']) {
        if (typeof geracao[campo] !== 'object' || geracao[campo] === null || Array.isArray(geracao[campo]) || Object.keys(geracao[campo]).some(id => !agentes.some(agente => agente.id === id && agente.tamanhoLote))) throw new Error('Partes da geração inválidas.');
    }
    if (Object.values(geracao.tamanhos_lote).some(tamanho => ![1, 2].includes(tamanho))) throw new Error('Tamanho de lote inválido.');
    if (Object.keys(geracao.etapas).some(chave => !agentes.some(agente => agente.id === chave))) throw new Error('Etapa desconhecida.');
    for (const agente of agentes.filter(item => Object.hasOwn(geracao.etapas, item.id))) {
        if (obterDependencias(agente, geracao).some(id => !Object.hasOwn(geracao.etapas, id))) throw new Error(`Dependência ausente: ${agente.id}.`);
    }
    if (Object.keys(geracao.partes).some(id => Object.hasOwn(geracao.etapas, id))) throw new Error('Partes de uma etapa já concluída.');
    return geracao;
}

function validarFormato(valor, modelo, caminho = 'resposta') {
    if (Array.isArray(modelo)) {
        if (!Array.isArray(valor)) throw new Error(`${caminho}: lista inválida.`);
        valor.forEach((item, indice) => validarFormato(item, modelo[0] ?? '', `${caminho}.${indice}`));
    } else if (modelo && typeof modelo === 'object') {
        if (!valor || typeof valor !== 'object' || Array.isArray(valor) || Object.keys(valor).length !== Object.keys(modelo).length || Object.keys(valor).some(chave => !Object.hasOwn(modelo, chave))) throw new Error(`${caminho}: campos inválidos.`);
        for (const [chave, exemplo] of Object.entries(modelo)) validarFormato(valor[chave], exemplo, `${caminho}.${chave}`);
    } else if (typeof valor !== typeof modelo || (typeof valor === 'string' && (!valor.trim() || valor.length > 20000)) || (typeof valor === 'number' && !Number.isInteger(valor))) throw new Error(`${caminho}: valor inválido.`);
    return valor;
}

function conferirCatalogo(colecao, entradas, planejamento) {
    const esperadas = planejamento[colecao];
    if (entradas.length !== esperadas.length || new Set(entradas.map(item => item.id)).size !== entradas.length) throw new Error(`Catálogo incompatível: ${colecao}.`);
    for (const item of entradas) {
        const planejado = esperadas.find(entrada => entrada.id === item.id);
        if (!planejado || (item.nome ?? item.titulo) !== planejado.nome) throw new Error(`Identidade incompatível: ${colecao}/${item.id}.`);
    }
}

function conferirReferencias(dados, planejamento, parcial = false) {
    const existe = (colecao, id) => planejamento[colecao].some(item => item.id === id);
    const conferir = (colecao, ids) => {
        if (new Set(ids).size !== ids.length || ids.some(id => !existe(colecao, id))) throw new Error(`Referência inválida: ${colecao}.`);
    };
    if (dados.mundo) conferir('ambientes', [dados.mundo.ambiente_inicial_id]);
    dados.classes?.forEach(classe => { calcularAtributos(classe); conferir('itens', classe.itens_iniciais_ids); if (!classe.itens_iniciais_ids.length) throw new Error('Classe sem itens iniciais.'); });
    dados.personagens?.forEach(npc => { conferir('ambientes', [npc.ambiente_id]); conferir('faccoes', npc.faccoes_ids); });
    dados.ambientes?.forEach(local => conferir('ambientes', local.conexoes_ids));
    dados.criaturas?.forEach(criatura => { conferir('ambientes', criatura.ambientes_ids); if (!criatura.ambientes_ids.length) throw new Error('Criatura sem ambiente.'); });
    dados.missoes?.forEach(missao => { conferir('ambientes', missao.ambientes_ids); conferir('personagens', missao.personagens_ids); if (!missao.ambientes_ids.length) throw new Error('Missão sem ambiente.'); });
    dados.faccoes?.forEach(faccao => {
        conferir('faccoes', faccao.aliados_ids); conferir('faccoes', faccao.rivais_ids);
        if ([...faccao.aliados_ids, ...faccao.rivais_ids].includes(faccao.id) || faccao.aliados_ids.some(id => faccao.rivais_ids.includes(id))) throw new Error('Relações de facção incompatíveis.');
        for (const campo of ['aliados_ids', 'rivais_ids']) {
            if (faccao[campo].some(id => {
                const outra = dados.faccoes.find(item => item.id === id);
                return outra ? !outra[campo].includes(faccao.id) : !parcial;
            })) throw new Error('Relação de facção não recíproca.');
        }
    });
    if (dados.ambientes) {
        dados.ambientes.forEach(local => {
            if (local.conexoes_ids.includes(local.id) || local.conexoes_ids.some(id => {
                const outro = dados.ambientes.find(candidato => candidato.id === id);
                return outro ? !outro.conexoes_ids.includes(local.id) : !parcial;
            })) throw new Error('Conexão de ambiente inválida.');
        });
        if (parcial) return;
        const visitados = new Set();
        const pendentes = [dados.mundo?.ambiente_inicial_id || dados.ambientes[0].id];
        while (pendentes.length) {
            const id = pendentes.pop();
            if (visitados.has(id)) continue;
            visitados.add(id);
            pendentes.push(...dados.ambientes.find(local => local.id === id).conexoes_ids);
        }
        if (visitados.size !== dados.ambientes.length) throw new Error('Mapa desconectado.');
    }
}

function validarEtapa(agente, resposta, planejamento) {
    validarFormato(resposta, criarContratoAgente(agente, planejamento).modelo);
    if (agente.id === 'mundo') {
        const reservado = criarPlanejamento(planejamento?.capitulos ? QUANTIDADES_CAMPANHA : {});
        for (const colecao of Object.keys(CATALOGO)) {
            const entradas = resposta.planejamento[colecao];
            const esperadas = colecao === 'racas' && !entradas.length ? [] : reservado[colecao];
            if (!saoIguais(entradas.map(item => item.id), esperadas.map(item => item.id))) throw new Error(`IDs do planejamento inválidos: ${colecao}.`);
            if (new Set(entradas.map(item => item.nome.toLocaleLowerCase('pt-BR'))).size !== entradas.length) throw new Error(`Nomes duplicados: ${colecao}.`);
        }
        if (planejamento?.capitulos && !saoIguais(resposta.planejamento.capitulos.map(item => item.id), Array.from({ length: TOTAL_CAPITULOS }, (_, indice) => `capitulo_${indice + 1}`))) throw new Error('Planejamento dos capítulos inválido.');
        conferirReferencias({ mundo: resposta.mundo }, resposta.planejamento);
    } else if (agente.id === 'revisao') {
        if (resposta.correcoes.length > 12 || resposta.correcoes.some(correcao => correcao.caminho.length < 2 || correcao.caminho.length > 6)) throw new Error('Revisão inválida.');
        if (resposta.aprovado && resposta.observacoes.length) throw new Error('Revisão aprovada com problemas pendentes.');
    } else {
        for (const colecao of agente.campos.filter(campo => CATALOGO[campo])) conferirCatalogo(colecao, resposta[colecao], planejamento);
        if (agente.id === 'ganchos' && resposta.ganchos_aventura.length !== (planejamento?.capitulos ? TOTAL_GANCHOS : 4)) throw new Error('Quantidade de ganchos inválida.');
        if (agente.id === 'capitulos') conferirCapitulos(resposta.capitulos, planejamento, planejamento.capitulos);
        conferirReferencias(resposta, planejamento);
    }
    return resposta;
}

function montarMundo(etapas) {
    const mundo = { versao: '1.0' };
    for (const agente of obterAgentes({ perfil: 'campanha' }).filter(item => item.id !== 'revisao')) {
        const resposta = etapas[agente.id];
        if (!resposta) continue;
        if (agente.id === 'capitulos') mundo.historia.capitulos = structuredClone(resposta.capitulos);
        else for (const campo of agente.campos.filter(item => item !== 'planejamento')) mundo[campo] = structuredClone(resposta[campo]);
    }
    if (mundo.ambientes) mundo.ambientes.forEach(local => { local.personagens_ids = (mundo.personagens || []).filter(npc => npc.ambiente_id === local.id).map(npc => npc.id); });
    return mundo;
}

function validarMundoGerado(mundo, planejamento) {
    validarMundo(mundo);
    for (const colecao of Object.keys(CATALOGO)) conferirCatalogo(colecao, mundo[colecao], planejamento);
    conferirReferencias(mundo, planejamento);
    if (!mundo.personagens.some(npc => npc.ambiente_id === mundo.mundo.ambiente_inicial_id)) throw new Error('Cenário inicial sem NPC.');
    if (planejamento.capitulos) conferirCapitulos(mundo.historia.capitulos, planejamento, planejamento.capitulos);
    return mundo;
}

function conferirCapitulos(capitulos, planejamento, esperados) {
    validarFormato(capitulos, [MODELO_CAPITULO]);
    if (capitulos.length !== esperados.length || new Set(capitulos.map(item => item.id)).size !== capitulos.length || capitulos.some(item => !esperados.some(esperado => esperado.id === item.id))) throw new Error('Capítulos incompatíveis com o planejamento.');
    for (const capitulo of capitulos) {
        if (capitulo.cenas.length < 3 || capitulo.cenas.length > 5) throw new Error('Capítulo deve conter de três a cinco cenas.');
        for (const cena of capitulo.cenas) {
            for (const colecao of ['ambientes', 'personagens', 'criaturas', 'missoes']) {
                const referencias = cena[`${colecao}_ids`];
                if (new Set(referencias).size !== referencias.length || referencias.some(id => !planejamento[colecao].some(item => item.id === id))) throw new Error(`Referência inválida na cena: ${colecao}.`);
            }
            if (!cena.ambientes_ids.length || !cena.pistas.length || !cena.abordagens.length || !cena.consequencias.length) throw new Error('Cena de capítulo incompleta.');
        }
    }
}

function aplicarRevisao(mundo, revisao, planejamento) {
    if (!revisao.aprovado) return validarMundoGerado(structuredClone(mundo), planejamento);
    const revisado = structuredClone(mundo);
    for (const correcao of revisao.correcoes) {
        const caminho = correcao.caminho;
        if (caminho.some(chave => ['__proto__', 'prototype', 'constructor', 'id', 'nome', 'titulo', 'bonus_atributos', 'personagens_ids'].includes(chave)) || ['versao'].includes(caminho[0])) throw new Error('Campo protegido na revisão.');
        let destino = revisado;
        for (const chave of caminho.slice(0, -1)) {
            if (!destino || typeof destino !== 'object' || !Object.hasOwn(destino, chave)) throw new Error('Caminho de revisão inválido.');
            destino = destino[chave];
        }
        const chave = caminho.at(-1);
        if (!destino || typeof destino !== 'object' || !Object.hasOwn(destino, chave)) throw new Error('Caminho de revisão inválido.');
        const anterior = destino[chave];
        const valor = JSON.parse(correcao.valor_json);
        if (typeof anterior === 'string') validarFormato(valor, 'texto');
        else if (Array.isArray(anterior) && anterior.every(item => typeof item === 'string') && caminho.length >= 2 && !Object.hasOwn(CATALOGO, caminho.at(-1))) validarFormato(valor, ['texto']);
        else throw new Error('Tipo de correção não permitido.');
        destino[chave] = valor;
    }
    revisado.ambientes.forEach(local => { local.personagens_ids = revisado.personagens.filter(npc => npc.ambiente_id === local.id).map(npc => npc.id); });
    return validarMundoGerado(completarRelacoes(revisado, planejamento), planejamento);
}

function criarContexto(geracao, etapas, modelo) {
    return { pedido: geracao.pedido, planejamento: etapas.mundo?.planejamento || criarPlanejamento(), dados_anteriores: montarMundo(etapas),
        quantidade_ganchos: etapas.mundo?.planejamento.capitulos ? TOTAL_GANCHOS : 4, modelo_saida: modelo };
}

function validarParte(agente, resposta, planejamento, quantidade) {
    const colecao = agente.campos[0];
    validarFormato(resposta, criarContratoAgente(agente, planejamento).modelo);
    const identificadores = new Set(resposta[colecao].map(item => item.id));
    const escopo = { ...planejamento, [colecao]: planejamento[colecao].filter(item => identificadores.has(item.id)) };
    if (colecao === 'capitulos') conferirCapitulos(resposta.capitulos, planejamento, escopo.capitulos);
    else conferirCatalogo(colecao, resposta[colecao], escopo);
    conferirReferencias(resposta, planejamento, true);
}

function montarCandidato({ agente, resposta, acumulado, planejamento, pedidos, etapas, geracao }) {
    const colecao = agente.campos[0];
    const contrato = criarContratoAgente(agente, planejamento, { [colecao]: pedidos });
    validarFormato(resposta, contrato.modelo);
    if (colecao === 'capitulos') conferirCapitulos(resposta.capitulos, planejamento, pedidos);
    else conferirCatalogo(colecao, resposta[colecao], { ...planejamento, [colecao]: pedidos });
    const entradas = new Map([...acumulado[colecao], ...resposta[colecao]].map(item => [item.id, item]));
    const ordenados = planejamento[colecao].filter(item => entradas.has(item.id)).map(item => entradas.get(item.id));
    const ajustes = [];
    const candidato = completarRelacoes({ [colecao]: ordenados }, planejamento, ajustes);
    validarParte(agente, candidato, planejamento);
    if (candidato[colecao].length === planejamento[colecao].length) {
        validarEtapa(agente, candidato, planejamento);
        if (agente.id === 'personagens' && !candidato.personagens.some(npc => npc.ambiente_id === etapas.mundo.mundo.ambiente_inicial_id)) throw new Error('Cenário inicial sem NPC.');
    }
    geracao.correcoes_automaticas ??= [];
    geracao.correcoes_automaticas.push(...ajustes.map(ajuste => ({ agente: agente.id, ...ajuste })));
    return candidato;
}

async function gerarPorLotes({ agente, geracao, etapas, executarAgente, aoSalvar, aoProgresso }) {
    const planejamento = etapas.mundo.planejamento;
    const colecao = agente.campos[0];
    const catalogo = planejamento[colecao];
    let acumulado = completarRelacoes(normalizarResposta(geracao.partes[agente.id] || { [colecao]: [] }, planejamento).dados, planejamento);
    validarParte(agente, acumulado, planejamento, acumulado[colecao]?.length);
    while (acumulado[colecao].length < catalogo.length) {
        const inicio = acumulado[colecao].length;
        const tamanho = geracao.tamanhos_lote[agente.id] || agente.tamanhoLote;
        const presentes = new Set(acumulado[colecao].map(item => item.id));
        const pedidos = catalogo.filter(item => !presentes.has(item.id)).slice(0, tamanho);
        const escopo = { [colecao]: pedidos };
        const contrato = criarContratoAgente(agente, planejamento, escopo);
        await aoProgresso(`${agente.titulo} ${inicio + 1}–${inicio + pedidos.length}/${catalogo.length}`);
        try {
            const contexto = { ...criarContexto(geracao, etapas, contrato.modelo), escopo_saida: escopo, dados_da_etapa: acumulado };
            acumulado = await executarComCorrecao({ agente, chave: `${agente.id}:${pedidos.map(item => item.id).join(',')}`, contexto, geracao,
                executarAgente: pedido => executarAgente(agente, pedido, contrato.esquema),
                validar: resposta => montarCandidato({ agente, resposta, acumulado, planejamento, pedidos, etapas, geracao }),
                salvar: () => aoSalvar(structuredClone(geracao)), informar: aoProgresso });
        } catch (erro) {
            if (pedidos.length > 1 && ['AGENTE_TRUNCADO', 'MUNDO_TRUNCADO'].includes(erro.code)) {
                geracao.tamanhos_lote[agente.id] = 1;
                await aoSalvar(structuredClone(geracao));
                continue;
            }
            throw erro;
        }
        geracao.partes[agente.id] = structuredClone(acumulado);
        await aoSalvar(structuredClone(geracao));
    }
    return acumulado;
}

async function gerarLotesParalelos({ agente, geracao, etapas, executarAgente, aoSalvar, aoProgresso }) {
    const planejamento = etapas.mundo.planejamento;
    const colecao = agente.campos[0];
    const catalogo = planejamento[colecao];
    let acumulado = normalizarResposta(geracao.partes[agente.id] || { [colecao]: [] }, planejamento).dados;
    validarParte(agente, acumulado, planejamento);
    const presentes = new Set(acumulado[colecao].map(item => item.id));
    const pendentes = catalogo.filter(item => !presentes.has(item.id));
    const tamanho = geracao.tamanhos_lote[agente.id] || agente.tamanhoLote;
    async function processar(pedidos) {
        const contrato = criarContratoAgente(agente, planejamento, { [colecao]: pedidos });
        const indice = catalogo.findIndex(item => item.id === pedidos[0].id) + 1;
        await aoProgresso(`${agente.titulo} ${indice}–${indice + pedidos.length - 1}/${catalogo.length}`);
        const contexto = { ...criarContexto(geracao, etapas, contrato.modelo), escopo_saida: { [colecao]: pedidos }, dados_da_etapa: structuredClone(acumulado) };
        try {
            await executarComCorrecao({ agente, chave: `${agente.id}:${pedidos.map(item => item.id).join(',')}`, contexto, geracao,
                executarAgente: pedido => executarAgente(agente, { ...pedido, dados_da_etapa: structuredClone(acumulado) }, contrato.esquema),
                validar: resposta => {
                    const candidato = montarCandidato({ agente, resposta, acumulado, planejamento, pedidos, etapas, geracao });
                    acumulado = candidato;
                    geracao.partes[agente.id] = structuredClone(acumulado);
                    return candidato;
                }, salvar: () => aoSalvar(structuredClone(geracao)), informar: aoProgresso });
            await aoSalvar(structuredClone(geracao));
        } catch (erro) {
            if (pedidos.length > 1 && ['AGENTE_TRUNCADO', 'MUNDO_TRUNCADO'].includes(erro.code)) {
                geracao.tamanhos_lote[agente.id] = 1;
                await aoSalvar(structuredClone(geracao));
                const resultados = await Promise.allSettled(pedidos.map(pedido => processar([pedido])));
                const rejeitado = resultados.find(item => item.status === 'rejected');
                if (rejeitado) throw rejeitado.reason;
            } else throw erro;
        }
    }
    const lotes = [];
    for (let indice = 0; indice < pendentes.length; indice += tamanho) lotes.push(processar(pendentes.slice(indice, indice + tamanho)));
    const resultados = await Promise.allSettled(lotes);
    const rejeitado = resultados.find(item => item.status === 'rejected');
    if (rejeitado) throw rejeitado.reason;
    return acumulado;
}

function ampliarGeracao(original) {
    const anterior = validarGeracao(structuredClone(original));
    if (anterior.perfil === 'campanha') throw new Error('Geração já usa o perfil de campanha.');
    if (!anterior.etapas.mundo) throw new Error('Planejamento original ausente.');
    const ampliada = criarGeracao(anterior.pedido);
    ampliada.preparacao = { base: structuredClone(anterior.etapas.mundo) };
    const revisado = anterior.etapas.revisao ? aplicarRevisao(montarMundo(anterior.etapas), anterior.etapas.revisao, anterior.etapas.mundo.planejamento) : null;
    if (revisado) ampliada.preparacao.base.mundo = structuredClone(revisado.mundo);
    if (anterior.etapas.historia) ampliada.preparacao.historia_herdada = structuredClone(anterior.etapas.historia);
    if (revisado) ampliada.preparacao.historia_herdada = { historia: structuredClone(revisado.historia) };
    for (const colecao of Object.keys(CATALOGO)) {
        const resposta = Object.values(anterior.etapas).find(item => Object.hasOwn(item, colecao)) || anterior.partes[colecao];
        if (resposta?.[colecao]) ampliada.partes[colecao] = { [colecao]: structuredClone(resposta[colecao]) };
        if (revisado) ampliada.partes[colecao] = { [colecao]: structuredClone(revisado[colecao]) };
    }
    const ambientes = ampliada.partes.ambientes?.ambientes;
    ambientes?.forEach(ambiente => { delete ambiente.personagens_ids; });
    if (ambientes?.length && ambientes.length < QUANTIDADES_CAMPANHA.ambientes) {
        const novoId = `ambiente_${ambientes.length + 1}`;
        if (!ambientes.at(-1).conexoes_ids.includes(novoId)) ambientes.at(-1).conexoes_ids.push(novoId);
    }
    return validarGeracao(ampliada);
}

async function gerarMundoComAgentes({ geracao, executarAgente, aoSalvar = async () => {}, aoProgresso = () => {}, concorrencia = 6 }) {
    validarGeracao(geracao);
    const agentes = obterAgentes(geracao);
    const etapas = {};
    let falha;
    const falhasEtapas = new Map();
    const fatal = erro => [401, 402, 403].includes(erro.status) || ['EACCES', 'EPERM', 'ENOSPC', 'EIO', 'ENOENT'].includes(erro.code);
    let filaSalvamento = Promise.resolve();
    const salvar = () => {
        const copia = structuredClone(geracao);
        filaSalvamento = filaSalvamento.then(() => aoSalvar(copia)).catch(erro => { falha ||= erro; throw erro; });
        return filaSalvamento;
    };
    const enfileirar = criarFilaConcorrente(concorrencia);
    const agendar = tarefa => enfileirar(() => {
        if (falha) { const erro = new Error('Geração interrompida após falha em outra etapa.'); erro.code = 'GERACAO_INTERROMPIDA'; throw erro; }
        return Promise.resolve().then(tarefa).catch(erro => { if (fatal(erro)) falha ||= erro; throw erro; });
    });
    const chamar = (agente, contexto, esquema) => agendar(() => executarAgente(agente, contexto, esquema));
    function contextoDependencias(agente) {
        const ids = new Set();
        function visitar(id) {
            if (ids.has(id)) return;
            ids.add(id);
            obterDependencias(agentes.find(item => item.id === id), geracao).forEach(visitar);
        }
        obterDependencias(agente, geracao).forEach(visitar);
        return Object.fromEntries([...ids].map(id => [id, etapas[id]]));
    }
    async function executarEtapa(agente) {
        try {
            const contextoEtapas = contextoDependencias(agente);
            const planejamento = contextoEtapas.mundo?.planejamento;
            const contrato = criarContratoAgente(agente, planejamento);
            if (agente.id === 'revisao') validarMundoGerado(montarMundo(contextoEtapas), planejamento);
            let resposta = geracao.etapas[agente.id];
            if (!resposta && agente.id === 'historia') resposta = geracao.preparacao?.historia_herdada;
            if (!resposta) {
                if (agente.id === 'mundo' && geracao.perfil === 'campanha') resposta = await prepararMundo({ agente, geracao, executarAgente, agendar,
                    salvar, informar: aoProgresso, validarFormato, validarBase: base => validarEtapa(agente, base) });
                else if (agente.id === 'capitulos') resposta = await gerarCapitulos({ agente, geracao, etapas: contextoEtapas, executarAgente: chamar,
                    salvar, informar: aoProgresso, validarFormato,
                    validarCapitulo: capitulo => conferirCapitulos([capitulo], planejamento, planejamento.capitulos.filter(item => item.id === capitulo.id)),
                    criarContexto: modelo => criarContexto(geracao, contextoEtapas, modelo) });
                else if (agente.tamanhoLote) {
                    const gerar = ['ambientes', 'faccoes'].includes(agente.id) ? gerarPorLotes : gerarLotesParalelos;
                    resposta = await gerar({ agente, geracao, etapas: contextoEtapas, executarAgente: chamar, aoSalvar: salvar, aoProgresso });
                }
                else {
                    await aoProgresso(agente.titulo);
                    const contexto = { ...criarContexto(geracao, contextoEtapas, contrato.modelo),
                        ...(agente.id === 'revisao' && geracao.ultima_revisao ? { revisao_anterior: geracao.ultima_revisao } : {}) };
                    resposta = await executarComCorrecao({ agente, chave: agente.id, contexto, geracao,
                        executarAgente: pedido => chamar(agente, pedido, contrato.esquema),
                        validar: candidata => {
                            validarEtapa(agente, candidata, planejamento);
                            if (agente.id === 'revisao') aplicarRevisao(montarMundo(contextoEtapas), candidata, planejamento);
                            return candidata;
                        }, salvar, informar: aoProgresso });
                }
            }
            if (agente.id !== 'mundo') resposta = normalizarResposta(resposta, planejamento).dados;
            if (['faccoes', 'ambientes'].includes(agente.id)) resposta = completarRelacoes(resposta, planejamento);
            validarEtapa(agente, resposta, agente.id === 'mundo' ? resposta.planejamento : planejamento);
            if (agente.id === 'personagens' && !resposta.personagens.some(npc => npc.ambiente_id === etapas.mundo.mundo.ambiente_inicial_id)) throw new Error('Cenário inicial sem NPC.');
            if (agente.id === 'revisao') {
                try { aplicarRevisao(montarMundo(contextoEtapas), resposta, planejamento); }
                catch (erro) { geracao.ultima_revisao = resposta; await salvar(); throw erro; }
            }
            etapas[agente.id] = structuredClone(resposta);
            geracao.etapas[agente.id] = structuredClone(resposta);
            delete geracao.partes[agente.id];
            delete geracao.ultima_revisao;
            await salvar();
        } catch (erro) {
            erro.etapa = agente.id;
            erro.message = `${agente.titulo}: ${erro.message}`;
            throw erro;
        }
    }
    const pendentes = new Set(agentes.map(agente => agente.id));
    const executando = new Map();
    while (pendentes.size || executando.size) {
        if (!falha) {
            for (const agente of agentes.filter(item => pendentes.has(item.id))) {
                if (obterDependencias(agente, geracao).some(id => !etapas[id])) continue;
                pendentes.delete(agente.id);
                executando.set(agente.id, executarEtapa(agente).then(() => ({ id: agente.id }), erro => ({ id: agente.id, erro })));
            }
        }
        if (!executando.size) {
            if (!falha && !falhasEtapas.size && pendentes.size) falha = new Error('Dependências da geração incompletas.');
            break;
        }
        const concluida = await Promise.race(executando.values());
        executando.delete(concluida.id);
        if (concluida.erro && concluida.erro.code !== 'GERACAO_INTERROMPIDA') {
            falhasEtapas.set(concluida.id, concluida.erro);
            if (fatal(concluida.erro)) falha ||= concluida.erro;
        }
    }
    if (!falha || [401, 402, 403].includes(falha.status)) await salvar();
    if (falha) throw falha;
    if (falhasEtapas.size) throw falhasEtapas.values().next().value;
    await filaSalvamento;
    const mundo = aplicarRevisao(montarMundo(etapas), etapas.revisao, etapas.mundo.planejamento);
    mundo.verificacao = { estrutura: 'validada', coerencia_ia: etapas.revisao.aprovado ? 'aprovada' : 'pendente',
        observacoes: etapas.revisao.observacoes, recuperacoes: structuredClone(geracao.recuperacoes || []),
        ajustes: structuredClone(geracao.correcoes_automaticas || []) };
    return mundo;
}

module.exports = { criarGeracao, ampliarGeracao, validarGeracao, validarFormato, validarEtapa, montarMundo, validarMundoGerado, aplicarRevisao, gerarMundoComAgentes };
