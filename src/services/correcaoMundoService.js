const { ATRIBUTOS } = require('./personagemService');
const { REGRAS } = require('../rules/habilidades');
const { isDeepStrictEqual: saoIguais } = require('node:util');
const { distinguirNomes, recuperarConteudo } = require('./recuperacaoGeracaoService');

function equilibrarBonus(bonus) {
    const ajustados = { ...bonus };
    for (const atributo of ATRIBUTOS) {
        const valor = Number(bonus[atributo] ?? 0);
        ajustados[atributo] = Number.isFinite(valor) ? Math.max(-2, Math.min(REGRAS.bonusMaximo, Math.round(valor))) : 0;
    }
    const positivos = ATRIBUTOS.filter(atributo => ajustados[atributo] > 0);
    const soma = positivos.reduce((total, atributo) => total + ajustados[atributo], 0);
    if (soma > REGRAS.somaBonusPositivosMaxima) {
        const proporcoes = positivos.map((atributo, ordem) => {
            const valor = ajustados[atributo] * REGRAS.somaBonusPositivosMaxima / soma;
            return { atributo, ordem, inteiro: Math.floor(valor), resto: valor - Math.floor(valor) };
        });
        let restantes = REGRAS.somaBonusPositivosMaxima - proporcoes.reduce((total, item) => total + item.inteiro, 0);
        proporcoes.sort((primeiro, segundo) => segundo.resto - primeiro.resto || primeiro.ordem - segundo.ordem);
        for (const item of proporcoes) ajustados[item.atributo] = item.inteiro + (restantes-- > 0 ? 1 : 0);
    }
    return ajustados;
}

function normalizarResposta(resposta, planejamento) {
    const dados = structuredClone(resposta);
    const ajustes = [];
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return { dados, ajustes };
    for (const [colecao, entradas] of Object.entries(dados)) {
        if (!Array.isArray(entradas) || !Array.isArray(planejamento?.[colecao]) || colecao === 'capitulos') continue;
        for (const item of entradas) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const oficial = planejamento[colecao].find(planejado => planejado.id === item.id);
            const campoNome = colecao === 'missoes' ? 'titulo' : 'nome';
            if (oficial && item[campoNome] !== oficial.nome) {
                ajustes.push({ tipo: 'identidade', id: item.id, antes: item[campoNome] ?? null, depois: oficial.nome });
                item[campoNome] = oficial.nome;
            }
            if (colecao === 'classes' && item.bonus_atributos && typeof item.bonus_atributos === 'object' && !Array.isArray(item.bonus_atributos)) {
                const equilibrados = equilibrarBonus(item.bonus_atributos);
                if (!saoIguais(item.bonus_atributos, equilibrados)) {
                    ajustes.push({ tipo: 'bonus_atributos', id: item.id, antes: structuredClone(item.bonus_atributos), depois: equilibrados });
                    item.bonus_atributos = equilibrados;
                }
            }
            for (const campo of ['aliados_ids', 'rivais_ids', 'conexoes_ids', 'faccoes_ids', 'ambientes_ids', 'personagens_ids', 'itens_iniciais_ids']) {
                if (!Array.isArray(item[campo])) continue;
                const mesmoCatalogo = (colecao === 'faccoes' && ['aliados_ids', 'rivais_ids'].includes(campo)) || (colecao === 'ambientes' && campo === 'conexoes_ids');
                const destino = { aliados_ids: 'faccoes', rivais_ids: 'faccoes', conexoes_ids: 'ambientes', itens_iniciais_ids: 'itens' }[campo] || campo.slice(0, -4);
                const validos = new Set((planejamento[destino] || []).map(entrada => entrada.id));
                const referencias = [...new Set(item[campo])].filter(id => validos.has(id) && (!mesmoCatalogo || id !== item.id));
                if (!referencias.length && ['ambientes_ids', 'itens_iniciais_ids'].includes(campo) && validos.size) referencias.push(validos.values().next().value);
                if (!saoIguais(referencias, item[campo])) {
                    ajustes.push({ tipo: 'referencias_normalizadas', id: item.id, campo, antes: item[campo], depois: referencias });
                    item[campo] = referencias;
                }
            }
        }
    }
    return { dados, ajustes };
}

function permiteCorrecao(erro) {
    if (erro instanceof TypeError || erro instanceof ReferenceError) return false;
    if (['AGENTE_VAZIO', 'RESPOSTA_INVALIDA'].includes(erro.code)) return true;
    return !erro.status && !['CONEXAO_INTERROMPIDA', 'AGENTE_TRUNCADO', 'MUNDO_TRUNCADO', 'GERACAO_INTERROMPIDA', 'CANCELADO', 'ENTRADA_ENCERRADA', 'EACCES', 'EPERM', 'ENOSPC', 'EIO', 'ENOENT'].includes(erro.code)
        && !/terminated|fetch failed/i.test(erro.message);
}

function normalizarGeracao(agente, resposta, contexto) {
    const normalizada = agente.id.startsWith('planejamento_') ? { dados: structuredClone(resposta), ajustes: [] } : normalizarResposta(resposta, contexto.planejamento);
    if (agente.id.startsWith('planejamento_')) {
        for (const colecao of Object.keys(contexto.escopo_saida || {})) {
            if (Array.isArray(normalizada.dados?.[colecao])) normalizada.ajustes.push(...distinguirNomes(normalizada.dados[colecao], contexto.planejamento[colecao]));
        }
    }
    if (agente.id === 'mundo' && normalizada.dados?.planejamento) {
        for (const entradas of Object.values(normalizada.dados.planejamento)) if (Array.isArray(entradas)) normalizada.ajustes.push(...distinguirNomes(entradas));
    }
    const inicial = contexto.dados_anteriores?.mundo?.ambiente_inicial_id;
    for (const npc of Array.isArray(normalizada.dados?.personagens) ? normalizada.dados.personagens : []) {
        if (!npc || typeof npc !== 'object') continue;
        if (inicial && (npc.id === 'npc_1' || !contexto.planejamento.ambientes.some(item => item.id === npc.ambiente_id)) && npc.ambiente_id !== inicial) {
            normalizada.ajustes.push({ tipo: 'localizacao_npc', id: npc.id, antes: npc.ambiente_id ?? null, depois: inicial });
            npc.ambiente_id = inicial;
        }
    }
    return normalizada;
}

async function recuperarEtapa({ agente, chave, contexto, geracao, resposta, erro, validar, salvar, informar = () => {} }) {
    let resultado;
    let normalizada;
    for (const descartarReferencias of [false, true]) {
        normalizada = normalizarGeracao(agente, recuperarConteudo(agente, contexto, resposta, { descartarReferencias }), contexto);
        try { resultado = validar(normalizada.dados); break; }
        catch (falha) { if (descartarReferencias) throw falha; }
    }
    geracao.recuperacoes ??= [];
    geracao.recuperacoes.push({ agente: agente.id, escopo: chave, motivo: erro.message, tipo: 'conteudo_simplificado' });
    geracao.correcoes_automaticas ??= [];
    geracao.correcoes_automaticas.push(...normalizada.ajustes.map(ajuste => ({ agente: agente.id, ...ajuste })));
    delete geracao.pendencias[chave];
    await informar(`${agente.titulo} — recuperação local`);
    await salvar();
    return resultado;
}

async function executarComCorrecao({ agente, chave, contexto, geracao, executarAgente, validar, salvar, informar = () => {}, maximo = 2 }) {
    geracao.pendencias ??= {};
    const pendente = geracao.pendencias[chave];
    let resposta = pendente?.resposta_gerada;
    let anterior = pendente?.resposta_anterior;
    let motivo = pendente?.erro;
    for (let tentativa = 0; tentativa <= maximo; tentativa++) {
        try {
            if (resposta === undefined) resposta = await executarAgente(motivo ? { ...contexto,
                correcao: { erro: motivo, resposta_anterior: anterior ?? null,
                    instrucao: 'Corrija somente a resposta deste escopo. Preserve os dados já aprovados, IDs, nomes oficiais e textos válidos. Entregue o mesmo contrato completo desta chamada. Não gere o mundo inteiro de novo.' } } : contexto);
            const normalizada = normalizarGeracao(agente, resposta, contexto);
            const resultado = validar(normalizada.dados);
            if (normalizada.ajustes.length) {
                geracao.correcoes_automaticas ??= [];
                geracao.correcoes_automaticas.push(...normalizada.ajustes.map(ajuste => ({ agente: agente.id, ...ajuste })));
            }
            delete geracao.pendencias[chave];
            return resultado;
        } catch (erro) {
            if (['AGENTE_TRUNCADO', 'MUNDO_TRUNCADO'].includes(erro.code)) {
                const quantidade = Math.max(0, ...Object.values(contexto.escopo_saida || {}).map(entradas => entradas.length));
                if (agente.id !== 'capitulos' && quantidade <= 1) return recuperarEtapa({ agente, chave, contexto, geracao,
                    resposta: erro.diagnostico?.resposta_parcial, erro, validar, salvar, informar });
            }
            if (!permiteCorrecao(erro)) throw erro;
            anterior = resposta ?? erro.diagnostico?.resposta_parcial ?? anterior;
            motivo = erro.message;
            geracao.pendencias[chave] = { agente: agente.id, erro: motivo, resposta_anterior: anterior ?? null,
                ...(resposta === undefined ? {} : { resposta_gerada: resposta }) };
            await salvar();
            if (tentativa === maximo) {
                return recuperarEtapa({ agente, chave, contexto, geracao, resposta: resposta ?? anterior, erro, validar, salvar, informar });
            }
            await informar(`${agente.titulo} — correção ${tentativa + 1}/${maximo}`);
            resposta = undefined;
        }
    }
}

module.exports = { equilibrarBonus, normalizarResposta, permiteCorrecao, executarComCorrecao, recuperarEtapa };
