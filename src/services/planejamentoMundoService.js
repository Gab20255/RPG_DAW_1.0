const { CATALOGO, criarPlanejamento, criarContratoAgente, criarEsquemaAgente } = require('../prompts/agentesMundoPrompt');
const { QUANTIDADES_CAMPANHA, TOTAL_CAPITULOS } = require('../rules/campanha');
const { executarComCorrecao } = require('./correcaoMundoService');

async function prepararMundo({ agente, geracao, executarAgente, agendar, salvar, informar, validarFormato, validarBase }) {
    geracao.preparacao ??= {};
    const preparacao = geracao.preparacao;
    if (!preparacao.base) {
        const contrato = criarContratoAgente(agente);
        await informar('Mundo');
        preparacao.base = await executarComCorrecao({ agente, chave: 'mundo:base',
            contexto: { pedido: geracao.pedido, planejamento: criarPlanejamento(), modelo_saida: contrato.modelo }, geracao,
            executarAgente: contexto => agendar(() => executarAgente(agente, contexto, contrato.esquema)),
            validar: candidata => { validarFormato(candidata, contrato.modelo); validarBase(candidata); return candidata; }, salvar, informar });
        await salvar();
    }
    validarBase(preparacao.base);
    preparacao.catalogos ??= structuredClone(preparacao.base.planejamento);
    preparacao.lotes ??= {};
    const reservado = criarPlanejamento(QUANTIDADES_CAMPANHA);
    let falha;
    const tarefas = Object.keys(CATALOGO).map(async colecao => {
        if (!Array.isArray(preparacao.catalogos[colecao])) throw new Error(`Planejamento inválido: ${colecao}.`);
        const catalogo = preparacao.catalogos[colecao];
        const total = colecao === 'racas' && !catalogo.length ? 0 : QUANTIDADES_CAMPANHA[colecao];
        if (catalogo.length > total) throw new Error(`Catálogo excede o perfil: ${colecao}.`);
        while (catalogo.length < total && !falha) {
            const quantidade = preparacao.lotes[colecao] || 8;
            const escopo = reservado[colecao].slice(catalogo.length, catalogo.length + quantidade);
            const modelo = { [colecao]: [{ id: 'ID reservado', nome: 'Nome próprio original', conceito: 'Papel concreto e vínculos em uma ou duas frases' }] };
            const esquema = criarEsquemaAgente(modelo);
            Object.assign(esquema.properties[colecao], { minItems: escopo.length, maxItems: escopo.length });
            const especialista = { id: `planejamento_${colecao}`, titulo: `Planejamento de ${colecao}`, orientacao: 'Amplie somente o catálogo atribuído. Crie nomes e conceitos concretos para os IDs de escopo_saida, sem repetir identidades existentes. Não desenvolva descrições completas nesta etapa. Não invente nomes de entidades de outros catálogos: use somente os nomes já oficiais ou descreva a relação por função. Distribua papéis complementares, ambientes, recursos, conflitos, ameaças e oportunidades. Preserve os fatos já estabelecidos. A resposta usa exatamente o modelo fornecido.' };
            try {
                await informar(`Planejamento ${colecao} ${catalogo.length + 1}–${catalogo.length + escopo.length}/${total}`);
                const contexto = { pedido: geracao.pedido, mundo: preparacao.base.mundo,
                    historia_existente: preparacao.historia_herdada?.historia || null, conteudo_existente: structuredClone(geracao.partes),
                    planejamento: structuredClone(preparacao.catalogos), escopo_saida: { [colecao]: escopo }, modelo_saida: modelo };
                const resposta = await executarComCorrecao({ agente: especialista, chave: `${especialista.id}:${escopo.map(item => item.id).join(',')}`, contexto, geracao,
                    executarAgente: pedido => agendar(() => { if (falha) throw falha; return executarAgente(especialista, pedido, esquema); }),
                    validar: candidata => {
                        validarFormato(candidata, modelo);
                        if (candidata[colecao].length !== escopo.length || candidata[colecao].some((item, indice) => item.id !== escopo[indice].id)) throw new Error(`IDs do planejamento inválidos: ${colecao}.`);
                        const nomes = [...catalogo, ...candidata[colecao]].map(item => item.nome.toLocaleLowerCase('pt-BR'));
                        if (new Set(nomes).size !== nomes.length) throw new Error(`Nomes duplicados: ${colecao}.`);
                        return candidata;
                    }, salvar, informar });
                catalogo.push(...resposta[colecao]);
                await salvar();
            } catch (erro) {
                if (escopo.length > 1 && erro.code === 'AGENTE_TRUNCADO') {
                    preparacao.lotes[colecao] = Math.max(1, Math.floor(quantidade / 2));
                    await salvar();
                } else {
                    if ([401, 402, 403].includes(erro.status) || ['EACCES', 'EPERM', 'ENOSPC', 'EIO', 'ENOENT'].includes(erro.code)) falha ||= erro;
                    throw erro;
                }
            }
        }
    });
    const resultados = await Promise.allSettled(tarefas);
    const rejeitada = resultados.find(resultado => resultado.status === 'rejected');
    if (rejeitada) throw rejeitada.reason;
    const planejamento = structuredClone(preparacao.catalogos);
    const arcos = ['Entrada e investigação', 'Interesses das facções', 'Expansão e revelações', 'Crise e escolhas', 'Confrontos e alianças', 'Desfechos e consequências'];
    planejamento.capitulos = arcos.slice(0, TOTAL_CAPITULOS).map((conceito, indice) => ({ id: `capitulo_${indice + 1}`, nome: `Capítulo ${indice + 1}`, conceito }));
    return { mundo: structuredClone(preparacao.base.mundo), planejamento };
}

module.exports = { prepararMundo };
