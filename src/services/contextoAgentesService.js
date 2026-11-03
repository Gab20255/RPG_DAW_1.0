function prepararContextoAgente(agente, contexto) {
    if (agente.id !== 'capitulos' || !contexto.cena_planejada) return contexto;
    const preparado = structuredClone(contexto);
    const dados = preparado.dados_anteriores;
    if (!dados) return preparado;
    const referencias = new Set(Object.entries(contexto.cena_planejada)
        .filter(([chave, valor]) => chave.endsWith('_ids') && Array.isArray(valor)).flatMap(([, ids]) => ids));
    referencias.add(dados.mundo?.ambiente_inicial_id);
    for (const missao of dados.missoes || []) {
        if (referencias.has(missao.id)) {
            missao.ambientes_ids.forEach(id => referencias.add(id));
            missao.personagens_ids.forEach(id => referencias.add(id));
        }
    }
    for (const npc of dados.personagens || []) {
        if (referencias.has(npc.id)) {
            referencias.add(npc.ambiente_id);
            npc.faccoes_ids.forEach(id => referencias.add(id));
        }
    }
    for (const criatura of dados.criaturas || []) {
        if (referencias.has(criatura.id)) criatura.ambientes_ids.forEach(id => referencias.add(id));
    }
    for (const [colecao, entradas] of Object.entries(dados)) {
        if (!Array.isArray(entradas) || ['racas', 'faccoes'].includes(colecao)) continue;
        dados[colecao] = entradas.map(entrada => {
            if (!entrada?.id || referencias.has(entrada.id)) return entrada;
            const planejada = contexto.planejamento?.[colecao]?.find(item => item.id === entrada.id);
            return {
                ...Object.fromEntries(Object.entries(entrada).filter(([campo]) =>
                    !['descricao', 'aparencia', 'prompt_imagem'].includes(campo))),
                ...(planejada ? { conceito: planejada.conceito } : {}),
            };
        });
    }
    return preparado;
}

module.exports = { prepararContextoAgente };
