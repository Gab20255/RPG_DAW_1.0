const { extrairPrefixoJson } = require('./jsonParcialService');

const normalizarNome = nome => nome.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

function distinguirNomes(entradas, existentes = []) {
    const ocupados = new Set(existentes.map(item => normalizarNome(item.nome)));
    const ajustes = [];
    for (const item of entradas) {
        if (typeof item?.nome !== 'string' || !item.nome.trim()) continue;
        const original = item.nome.trim().replace(/\s+/g, ' ');
        let nome = original;
        let numero = 2;
        while (ocupados.has(normalizarNome(nome))) nome = `${original} (${numero++})`;
        if (nome !== item.nome) ajustes.push({ tipo: 'nome_distinguido', id: item.id, antes: item.nome, depois: nome });
        item.nome = nome;
        ocupados.add(normalizarNome(nome));
    }
    return ajustes;
}

function lerRespostaParcial(resposta) {
    if (resposta && typeof resposta === 'object') return structuredClone(resposta);
    if (typeof resposta !== 'string') return {};
    const raiz = extrairPrefixoJson(resposta);
    function completos(no) {
        if (!no) return undefined;
        if (no.completo) return no.valor;
        if (Array.isArray(no.filhos)) return no.filhos.map(completos).filter(item => item !== undefined);
        if (no.filhos) return Object.fromEntries(Object.entries(no.filhos).map(([chave, filho]) => [chave, completos(filho)]).filter(([, valor]) => valor !== undefined));
    }
    return completos(raiz) || {};
}

function recuperarConteudo(agente, contexto, resposta, { descartarReferencias = false } = {}) {
    const anterior = lerRespostaParcial(resposta);
    const planejamento = contexto.planejamento || {};
    const dados = contexto.dados_anteriores || {};
    let pedido;
    try { pedido = JSON.parse(contexto.pedido); } catch { pedido = { tema: contexto.pedido }; }
    const tema = pedido?.tema || contexto.pedido || 'Uma comunidade precisa lidar com interesses em conflito.';
    const inicial = dados.mundo?.ambiente_inicial_id || contexto.mundo?.ambiente_inicial_id || planejamento.ambientes?.[0]?.id;
    const nomeLocal = planejamento.ambientes?.find(item => item.id === inicial)?.nome || 'o cenário inicial';
    const escolher = (colecao, indice = 0) => planejamento[colecao]?.[indice % (planejamento[colecao]?.length || 1)]?.id;
    function textoPadrao(campo, entidade = {}) {
        const nome = entidade.nome || contexto.cena_planejada?.nome || contexto.capitulo_planejado?.nome || pedido?.nome_aventura || 'Ponto de partida';
        const conceito = entidade.conceito || contexto.capitulo_planejado?.conceito || dados.historia?.conflito_principal || tema;
        const textos = {
            nome, titulo: nome, id: entidade.id || contexto.capitulo_planejado?.id,
            tema, tom: pedido?.tom || dados.mundo?.tom || 'Mistério e aventura',
            descricao: conceito, conceito, sinopse: conceito, desenvolvimento: conceito,
            passado: dados.mundo?.descricao || tema, situacao_atual: tema, conflito_principal: tema,
            objetivo_principal: `Investigar o conflito em ${nomeLocal} e decidir como intervir.`,
            preludio: `A aventura começa em ${nomeLocal}. ${dados.mundo?.descricao || tema} O grupo encontra interesses em disputa e pode investigar antes de tomar partido.`,
            objetivo: `Investigar ${nome} e decidir como lidar com a situação: ${conceito}`,
            aparencia: `Roupas e equipamentos de uso cotidiano, marcados pelas condições de ${nomeLocal}.`,
            personalidade: 'Cauteloso ao falar de seus interesses; avalia a confiança do grupo pelas atitudes.',
            motivacao: conceito, segredo: 'Guarda informações sobre o conflito e exige confiança antes de compartilhá-las.',
            papel: 'neutro', tipo: agente.id === 'missoes' ? 'secundaria' : 'Recurso do cenário',
            comportamento: 'Observa à distância, evita riscos desnecessários e reage quando ameaçado.',
            ameaca: 'media', efeito: 'Recurso narrativo cuja utilização depende das condições da cena.',
            raridade: 'comum', limitacao: 'Depende de preparação e das condições da cena; não altera atributos automaticamente.',
            importancia: conceito, prompt_imagem: `${nome}. ${conceito}`,
            ambiente_id: inicial, ambiente_inicial_id: inicial,
        };
        return String(textos[campo] || conceito).slice(0, 12000);
    }
    function preencher(valor, modelo, campo, entidade = {}, indice = 0) {
        if (campo === 'bonus_atributos') return Object.fromEntries(Object.keys(modelo).map(chave => [chave, Number.isFinite(Number(valor?.[chave])) ? Number(valor[chave]) : 0]));
        if (campo.endsWith('_ids')) {
            const colecao = { aliados_ids: 'faccoes', rivais_ids: 'faccoes', conexoes_ids: 'ambientes', itens_iniciais_ids: 'itens' }[campo] || campo.slice(0, -4);
            const validos = new Set((planejamento[colecao] || []).map(item => item.id));
            const ids = descartarReferencias ? [] : [...new Set(Array.isArray(valor) ? valor : [])].filter(id => validos.has(id) && (!['aliados_ids', 'rivais_ids', 'conexoes_ids'].includes(campo) || id !== entidade.id));
            if (!ids.length && ['ambientes_ids', 'itens_iniciais_ids'].includes(campo)) {
                const id = campo === 'ambientes_ids' ? inicial : escolher('itens', indice);
                if (id) ids.push(id);
            }
            return ids;
        }
        if (campo === 'ambiente_id' || campo === 'ambiente_inicial_id') return !descartarReferencias && planejamento.ambientes?.some(item => item.id === valor) ? valor : inicial;
        if (campo === 'id' && (entidade.id || contexto.capitulo_planejado?.id)) return entidade.id || contexto.capitulo_planejado.id;
        if (['nome', 'titulo'].includes(campo) && entidade.nome) return entidade.nome;
        if (campo === 'nome' && contexto.cena_planejada?.nome) return contexto.cena_planejada.nome;
        if (Array.isArray(modelo)) {
            if (campo === 'planejamento_cenas') {
                const preservadas = contexto.cenas_preservadas || {};
                const quantidade = Math.min(5, Math.max(3, ...Object.keys(preservadas).map(chave => Number(chave) + 1)));
                return Array.from({ length: quantidade }, (_, posicao) => preencher({ ...(valor?.[posicao] || {}), ...(preservadas[posicao] || {}) }, modelo[0], 'cena', { nome: `${contexto.capitulo_planejado?.nome || 'Capítulo'} — ${['Descoberta', 'Investigação', 'Decisão', 'Repercussão', 'Travessia'][posicao]}` }, posicao));
            }
            const exemplos = {
                pistas: [`Em ${nomeLocal}, investigar os sinais do conflito e comparar os relatos disponíveis.`],
                abordagens: ['Conversar com os envolvidos.', 'Explorar o local antes de assumir compromissos.'],
                consequencias: ['Se o grupo intervier, os envolvidos reagem conforme seus interesses; se adiar, o conflito permanece aberto.'],
                desfechos_possiveis: ['Uma negociação pode abrir novos caminhos.', 'Um confronto pode agravar a disputa.', 'O grupo pode recuar e buscar mais informações.'],
                recompensas: ['Informações e contatos relacionados à investigação.'],
                regras_do_universo: [tema], tracos: ['Costumes ligados ao cotidiano e aos recursos locais.'],
            };
            if (campo === 'ganchos_aventura') {
                const quantidade = contexto.quantidade_ganchos || 4;
                return Array.from({ length: quantidade }, (_, posicao) => typeof valor?.[posicao] === 'string' && valor[posicao].trim() ? valor[posicao] : `Em ${planejamento.ambientes?.[posicao % planejamento.ambientes.length]?.nome || nomeLocal}, uma pista envolve ${planejamento.personagens?.[posicao % planejamento.personagens.length]?.nome || 'um contato local'}: ${planejamento.missoes?.[posicao % planejamento.missoes.length]?.conceito || tema}`);
            }
            const itens = Array.isArray(valor) ? valor : exemplos[campo] || [];
            const limite = ['pistas', 'abordagens', 'consequencias', 'desfechos_possiveis'].includes(campo) ? 4 : 24;
            const preenchidos = itens.slice(0, limite).map(item => preencher(item, modelo[0] ?? '', 'entrada', entidade, indice));
            return preenchidos.length ? preenchidos : exemplos[campo] || [];
        }
        if (modelo && typeof modelo === 'object') return Object.fromEntries(Object.entries(modelo).map(([chave, exemplo]) => [chave, preencher(valor?.[chave], exemplo, chave, entidade, indice)]));
        if (typeof modelo === 'number') return Number.isFinite(Number(valor)) ? Math.round(Number(valor)) : 0;
        if (typeof modelo === 'boolean') return typeof valor === 'boolean' ? valor : false;
        return typeof valor === 'string' && valor.trim() ? valor.slice(0, 12000) : textoPadrao(campo, entidade);
    }
    if (agente.id === 'revisao') return { aprovado: false, observacoes: ['Revisão automática inconclusiva; estrutura validada pelo código.'], correcoes: [] };
    const resultado = {};
    for (const [campo, modelo] of Object.entries(contexto.modelo_saida)) {
        if (Array.isArray(modelo) && Array.isArray(planejamento[campo]) && campo !== 'capitulos') {
            const entradas = contexto.escopo_saida?.[campo] || planejamento[campo];
            resultado[campo] = entradas.map((planejada, indice) => {
                const recebidas = Array.isArray(anterior[campo]) ? anterior[campo] : [];
                const recebida = recebidas.find(item => item?.id === planejada.id) || recebidas[indice];
                return preencher(recebida, modelo[0], campo, agente.id.startsWith('planejamento_') ? { id: planejada.id } : planejada, indice);
            });
        } else if (campo === 'planejamento') {
            resultado[campo] = Object.fromEntries(Object.entries(planejamento).map(([colecao, entradas]) => [colecao, entradas.map((entrada, indice) => ({
                id: entrada.id, nome: anterior.planejamento?.[colecao]?.[indice]?.nome || `${colecao} ${indice + 1}`,
                conceito: anterior.planejamento?.[colecao]?.[indice]?.conceito || `${tema} Papel a desenvolver: ${colecao} ${indice + 1}.`,
            }))]));
        } else resultado[campo] = preencher(anterior[campo], modelo, campo);
    }
    return resultado;
}

module.exports = { distinguirNomes, recuperarConteudo };
