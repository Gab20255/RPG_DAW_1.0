const { MODELO_CAPITULO } = require('../rules/campanha');
const { criarEsquemaAgente } = require('../prompts/agentesMundoPrompt');
const { executarComCorrecao, recuperarEtapa } = require('./correcaoMundoService');
const { extrairPrefixoJson } = require('./jsonParcialService');

const CAMPOS_ABERTURA = ['id', 'titulo', 'sinopse', 'desenvolvimento'];
const CAMPOS_PLANO = ['nome', 'objetivo', 'ambientes_ids', 'personagens_ids', 'criaturas_ids', 'missoes_ids'];
const MODELO_PLANO = Object.fromEntries(CAMPOS_PLANO.map(campo => [campo, MODELO_CAPITULO.cenas[0][campo]]));
const MODELO_ABERTURA = { ...Object.fromEntries(CAMPOS_ABERTURA.map(campo => [campo, MODELO_CAPITULO[campo]])), planejamento_cenas: [MODELO_PLANO] };

function obterFragmento(geracao, id) {
    geracao.fragmentos_capitulos ??= {};
    const fragmento = geracao.fragmentos_capitulos[id] ??= { abertura: {}, cenas: {}, fechamento: {} };
    for (const campo of ['abertura', 'cenas', 'fechamento']) {
        fragmento[campo] ??= {};
        if (typeof fragmento[campo] !== 'object' || Array.isArray(fragmento[campo])) throw new Error('Fragmento de capítulo inválido.');
    }
    return fragmento;
}

function conferirCampo(campo, valor, modelo, planejamento, id, validarFormato, fragmento) {
    validarFormato({ [campo]: valor }, { [campo]: modelo });
    if (campo === 'id' && valor !== id) throw new Error('ID do capítulo incompatível.');
    if (campo.endsWith('_ids')) {
        const colecao = campo.slice(0, -4);
        if (new Set(valor).size !== valor.length || valor.some(referencia => !planejamento[colecao]?.some(item => item.id === referencia))) throw new Error(`Referência inválida na cena: ${campo}.`);
        if (campo === 'ambientes_ids' && !valor.length) throw new Error('Cena sem ambiente.');
    }
    if (['pistas', 'abordagens', 'consequencias', 'desfechos_possiveis'].includes(campo) && (!valor.length || valor.length > 5)) throw new Error(`Quantidade inválida: ${campo}.`);
    if (campo === 'planejamento_cenas') {
        const indices = Object.keys(fragmento.cenas).map(Number);
        const minimo = Math.max(3, ...indices.map(indice => indice + 1));
        if (valor.length < minimo || valor.length > 5) throw new Error(`Planejamento deve ter de ${minimo} a cinco cenas.`);
        valor.forEach((cena, indice) => {
            for (const chave of CAMPOS_PLANO) {
                if (fragmento.cenas[indice]?.[chave] !== undefined) cena[chave] = structuredClone(fragmento.cenas[indice][chave]);
                conferirCampo(chave, cena[chave], MODELO_PLANO[chave], planejamento, id, validarFormato, fragmento);
            }
        });
    }
    return valor;
}

function recuperarCapituloParcial(geracao, texto, validarFormato) {
    const raiz = extrairPrefixoJson(texto);
    const capitulos = raiz?.filhos?.capitulos?.filhos || [];
    const planejamento = geracao.etapas.mundo?.planejamento;
    let recuperados = 0;
    for (const no of capitulos) {
        const id = no.filhos?.id?.completo ? no.filhos.id.valor : null;
        if (!planejamento?.capitulos?.some(item => item.id === id)) continue;
        if (geracao.partes.capitulos?.capitulos.some(item => item.id === id) || geracao.etapas.capitulos?.capitulos.some(item => item.id === id)) continue;
        const fragmento = obterFragmento(geracao, id);
        const guardar = (destino, campo, modelo, item) => {
            if (!item?.completo || Object.hasOwn(destino, campo)) return;
            try {
                destino[campo] = structuredClone(conferirCampo(campo, item.valor, modelo, planejamento, id, validarFormato, fragmento));
                recuperados++;
            } catch {}
        };
        for (const campo of CAMPOS_ABERTURA) guardar(fragmento.abertura, campo, MODELO_CAPITULO[campo], no.filhos?.[campo]);
        for (const [indice, cena] of (no.filhos?.cenas?.filhos || []).entries()) {
            if (indice >= 5) break;
            const destino = fragmento.cenas[indice] ??= {};
            for (const [campo, modelo] of Object.entries(MODELO_CAPITULO.cenas[0])) guardar(destino, campo, modelo, cena.filhos?.[campo]);
            if (!Object.keys(destino).length) delete fragmento.cenas[indice];
        }
        guardar(fragmento.fechamento, 'desfechos_possiveis', MODELO_CAPITULO.desfechos_possiveis, no.filhos?.desfechos_possiveis);
        const indices = Object.keys(fragmento.cenas).map(Number).sort((primeiro, segundo) => primeiro - segundo);
        if (!fragmento.abertura.planejamento_cenas && indices.length >= 3 && indices.length <= 5
            && indices.every((indice, posicao) => indice === posicao && CAMPOS_PLANO.every(campo => Object.hasOwn(fragmento.cenas[indice], campo)))) {
            fragmento.abertura.planejamento_cenas = indices.map(indice => Object.fromEntries(CAMPOS_PLANO.map(campo => [campo, structuredClone(fragmento.cenas[indice][campo])])));
        }
    }
    return recuperados;
}

function limitarEsquema(esquema, campo) {
    if (esquema.type === 'string') esquema.maxLength = campo === 'desenvolvimento' ? 6000 : campo === 'descricao' ? 4500 : ['id', 'nome', 'titulo'].includes(campo) ? 200 : campo === 'entrada' ? 1000 : 2200;
    if (esquema.type === 'array') {
        esquema.minItems = campo.endsWith('_ids') ? (campo === 'ambientes_ids' ? 1 : 0) : 1;
        esquema.maxItems = campo.endsWith('_ids') ? 8 : campo === 'planejamento_cenas' ? 5 : 4;
        limitarEsquema(esquema.items, campo.endsWith('_ids') ? 'id' : 'entrada');
    }
    if (esquema.type === 'object') for (const [chave, valor] of Object.entries(esquema.properties)) limitarEsquema(valor, chave);
}

async function gerarCapitulos({ agente, geracao, etapas, executarAgente, salvar, informar, validarFormato, validarCapitulo, criarContexto }) {
    const planejamento = etapas.mundo.planejamento;
    const prontos = new Map((geracao.partes.capitulos?.capitulos || []).map(capitulo => [capitulo.id, structuredClone(capitulo)]));
    for (const capitulo of prontos.values()) validarCapitulo(capitulo);
    for (const [chave, pendente] of Object.entries(geracao.pendencias || {})) {
        if (!chave.startsWith('capitulos:') || !pendente.resposta_gerada?.capitulos) continue;
        recuperarCapituloParcial(geracao, JSON.stringify(pendente.resposta_gerada), validarFormato);
        delete geracao.pendencias[chave];
    }
    const tarefas = planejamento.capitulos.filter(item => !prontos.has(item.id)).map(async planejado => {
        const fragmento = obterFragmento(geracao, planejado.id);
        const especialista = { ...agente, orientacao: 'Você desenvolve somente uma parte de um capítulo. Responda exclusivamente os campos de modelo_saida, sem devolver um capítulo inteiro ou o array capitulos. O capítulo faz parte do arco indicado no planejamento. A abertura contextualiza o conflito em cerca de 200 a 350 palavras; o planejamento define de três a cinco cenas, preferindo três quando bastarem. Cada cena desenvolve aproximadamente 200 a 400 palavras somando os campos, com situação, problema, pistas, alternativas e consequências condicionais. Os desfechos apresentam três ou quatro alternativas concretas. Preserve todos os campos já salvos. Não decida ações do jogador nem afirme que ele já concluiu uma missão. Desenvolva detalhes concretos sem repetir a abertura nas cenas. Ao receber um único campo, dedique a resposta somente a ele. Respeite limite_de_escrita quando informado.' };
        async function gerarCampos(modelo, destino, parte, campos = Object.keys(modelo), compactacoes = 0) {
            const faltantes = campos.filter(campo => !Object.hasOwn(destino, campo));
            if (!faltantes.length) return;
            const modeloSaida = Object.fromEntries(faltantes.map(campo => [campo, modelo[campo]]));
            const esquema = criarEsquemaAgente(modeloSaida);
            limitarEsquema(esquema, 'resposta');
            const indiceCena = Number(parte.match(/^cena (\d+)\//)?.[1]) - 1;
            const cenaPlanejada = fragmento.abertura.planejamento_cenas?.[indiceCena];
            if (esquema.properties.nome && cenaPlanejada) esquema.properties.nome.enum = [cenaPlanejada.nome];
            if (esquema.properties.id) esquema.properties.id.enum = [planejado.id];
            if (esquema.properties.planejamento_cenas) esquema.properties.planejamento_cenas.minItems = Math.max(3, ...Object.keys(fragmento.cenas).map(indice => Number(indice) + 1));
            const chave = `capitulo:${planejado.id}:${parte}:${faltantes.join(',')}`;
            const contexto = { ...criarContexto(modeloSaida), capitulo_planejado: planejado,
                parte_do_capitulo: parte, campos_solicitados: faltantes, campos_ja_salvos: structuredClone(destino),
                abertura: structuredClone(fragmento.abertura), cenas_preservadas: structuredClone(fragmento.cenas),
                ...(cenaPlanejada ? { cena_planejada: cenaPlanejada } : {}),
                ...(compactacoes ? { limite_de_escrita: faltantes[0] === 'planejamento_cenas'
                    ? 'Preserve a quantidade de cenas exigida pelo esquema e as cenas já salvas. Resuma cada objetivo a uma frase e inclua somente referências necessárias.'
                    : 'Entregue este campo em até 250 palavras, ou até três entradas breves se for uma lista. Preserve o conteúdo das outras partes.' } : {}) };
            await informar(`${planejado.nome} — ${parte}`);
            try {
                await executarComCorrecao({ agente: especialista, chave, contexto, geracao,
                    executarAgente: pedido => executarAgente(especialista, pedido, esquema), salvar, informar,
                    validar: candidata => {
                        if (Object.hasOwn(candidata, 'nome') && cenaPlanejada) candidata.nome = cenaPlanejada.nome;
                        validarFormato(candidata, modeloSaida);
                        for (const campo of faltantes) conferirCampo(campo, candidata[campo], modelo[campo], planejamento, planejado.id, validarFormato, fragmento);
                        Object.assign(destino, structuredClone(candidata));
                        return candidata;
                    } });
                await salvar();
            } catch (erro) {
                if (!['AGENTE_TRUNCADO', 'MUNDO_TRUNCADO'].includes(erro.code)) throw erro;
                const prefixo = extrairPrefixoJson(erro.diagnostico?.resposta_parcial);
                let recuperados = 0;
                for (const campo of faltantes) {
                    const no = prefixo?.filhos?.[campo];
                    if (!no?.completo) continue;
                    try {
                        destino[campo] = structuredClone(conferirCampo(campo, no.valor, modelo[campo], planejamento, planejado.id, validarFormato, fragmento));
                        recuperados++;
                    } catch {}
                }
                if (recuperados) await salvar();
                const restantes = faltantes.filter(campo => !Object.hasOwn(destino, campo));
                if (!restantes.length) return;
                if (restantes.length > 1) {
                    const meio = Math.ceil(restantes.length / 2);
                    const grupos = await Promise.allSettled([gerarCampos(modelo, destino, parte, restantes.slice(0, meio)), gerarCampos(modelo, destino, parte, restantes.slice(meio))]);
                    const rejeitado = grupos.find(item => item.status === 'rejected');
                    if (rejeitado) throw rejeitado.reason;
                    return;
                }
                if (faltantes.length > 1 || compactacoes < 2) return gerarCampos(modelo, destino, parte, restantes, faltantes.length > 1 ? 0 : compactacoes + 1);
                const recuperada = await recuperarEtapa({ agente: especialista, chave, contexto: { ...contexto,
                    modelo_saida: Object.fromEntries(restantes.map(campo => [campo, modelo[campo]])) }, geracao,
                    resposta: erro.diagnostico?.resposta_parcial, erro, salvar, informar,
                    validar: candidata => {
                        for (const campo of restantes) conferirCampo(campo, candidata[campo], modelo[campo], planejamento, planejado.id, validarFormato, fragmento);
                        return candidata;
                    } });
                Object.assign(destino, recuperada);
                await salvar();
            }
        }
        await gerarCampos(MODELO_ABERTURA, fragmento.abertura, 'abertura e planejamento');
        const cenas = fragmento.abertura.planejamento_cenas;
        const resultados = await Promise.allSettled(cenas.map((_, indice) => {
            const destino = fragmento.cenas[indice] ??= {};
            return gerarCampos(MODELO_CAPITULO.cenas[0], destino, `cena ${indice + 1}/${cenas.length}`);
        }));
        const rejeitado = resultados.find(item => item.status === 'rejected');
        if (rejeitado) throw rejeitado.reason;
        await gerarCampos({ desfechos_possiveis: MODELO_CAPITULO.desfechos_possiveis }, fragmento.fechamento, 'desfechos');
        const capitulo = { ...Object.fromEntries(CAMPOS_ABERTURA.map(campo => [campo, fragmento.abertura[campo]])),
            cenas: cenas.map((_, indice) => structuredClone(fragmento.cenas[indice])), desfechos_possiveis: fragmento.fechamento.desfechos_possiveis };
        validarCapitulo(capitulo);
        prontos.set(capitulo.id, capitulo);
        geracao.partes.capitulos = { capitulos: planejamento.capitulos.filter(item => prontos.has(item.id)).map(item => prontos.get(item.id)) };
        delete geracao.fragmentos_capitulos[planejado.id];
        await salvar();
    });
    const resultados = await Promise.allSettled(tarefas);
    const rejeitado = resultados.find(item => item.status === 'rejected');
    if (rejeitado) throw rejeitado.reason;
    return { capitulos: planejamento.capitulos.map(item => prontos.get(item.id)) };
}

module.exports = { gerarCapitulos, recuperarCapituloParcial };
