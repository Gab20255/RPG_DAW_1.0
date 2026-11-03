function completarVinculos(entradas, planejadas, campos, opostos = {}, ajustes = []) {
    const copia = structuredClone(entradas);
    const catalogo = new Set(planejadas.map(item => item.id));
    const presentes = new Map(copia.map(item => [item.id, item]));
    if (opostos.aliados_ids) {
        const pares = new Map();
        for (const item of copia) for (const campo of ['rivais_ids', 'aliados_ids']) {
            for (const id of item[campo] || []) {
                const par = [item.id, id].sort().join(':');
                if (!pares.has(par)) pares.set(par, campo);
                else if (pares.get(par) !== campo) {
                    item[campo] = item[campo].filter(referencia => referencia !== id);
                    ajustes.push({ tipo: 'relacao_conflitante', id: item.id, referencia: id, removida: campo, mantida: pares.get(par) });
                }
            }
        }
    }
    for (const item of copia) {
        if (!catalogo.has(item.id)) throw new Error(`Identificador desconhecido: ${item.id}.`);
        for (const campo of campos) {
            const referencias = item[campo];
            if (!Array.isArray(referencias) || new Set(referencias).size !== referencias.length) throw new Error(`Lista de vínculos inválida: ${item.id}/${campo}.`);
            for (const identificador of referencias) {
                if (!catalogo.has(identificador)) throw new Error(`Referência inexistente: ${item.id} → ${identificador}.`);
                if (identificador === item.id) throw new Error(`Vínculo consigo mesmo: ${item.id}.`);
                const outra = presentes.get(identificador);
                const oposto = opostos[campo];
                if (oposto && (item[oposto]?.includes(identificador) || outra?.[oposto]?.includes(item.id))) throw new Error(`Aliança e rivalidade conflitantes: ${item.id} e ${identificador}.`);
                if (outra && Array.isArray(outra[campo]) && !outra[campo].includes(item.id)) outra[campo].push(item.id);
            }
        }
    }
    return copia;
}

function completarRelacoes(dados, planejamento, ajustes = []) {
    const copia = structuredClone(dados);
    if (copia.faccoes) copia.faccoes = completarVinculos(copia.faccoes, planejamento.faccoes,
        ['aliados_ids', 'rivais_ids'], { aliados_ids: 'rivais_ids', rivais_ids: 'aliados_ids' }, ajustes);
    if (copia.ambientes) copia.ambientes = completarVinculos(copia.ambientes, planejamento.ambientes, ['conexoes_ids']);
    if (copia.ambientes?.length === planejamento.ambientes.length) {
        const visitados = new Set();
        const visitar = inicio => {
            const fila = [inicio];
            while (fila.length) {
                const id = fila.pop();
                if (visitados.has(id)) continue;
                visitados.add(id);
                fila.push(...copia.ambientes.find(item => item.id === id).conexoes_ids);
            }
        };
        visitar(copia.ambientes[0].id);
        for (let indice = 1; indice < copia.ambientes.length; indice++) {
            const local = copia.ambientes[indice];
            if (visitados.has(local.id)) continue;
            const anterior = copia.ambientes[indice - 1];
            anterior.conexoes_ids.push(local.id);
            local.conexoes_ids.push(anterior.id);
            ajustes.push({ tipo: 'conexao_mapa', origem: anterior.id, destino: local.id });
            visitar(local.id);
        }
    }
    return copia;
}

module.exports = { completarRelacoes };
