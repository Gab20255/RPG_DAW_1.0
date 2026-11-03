const { LIMITES_CRIATIVOS } = require('./mestrePrompt');

function modeloAprofundamento(mundo) {
    return {
        descricao_mundo: mundo.mundo.descricao,
        historia: Object.fromEntries(['passado', 'situacao_atual', 'conflito_principal', 'objetivo_principal', 'preludio'].map((chave) => [chave, mundo.historia[chave]])),
        classes: mundo.classes.map(({ id, descricao }) => ({ id, descricao })),
        ambientes: mundo.ambientes.map(({ id, descricao, importancia }) => ({ id, descricao, importancia })),
        personagens: mundo.personagens.map(({ id, descricao, aparencia, personalidade, motivacao }) => ({ id, descricao, aparencia, personalidade, motivacao })),
    };
}

function criarEsquema(valor) {
    if (Array.isArray(valor)) return { type: 'array', items: criarEsquema(valor[0]), minItems: valor.length, maxItems: valor.length };
    if (valor && typeof valor === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, criarEsquema(item)])), required: Object.keys(valor), additionalProperties: false };
    return { type: 'string' };
}

function criarPromptAprofundamento(limite) {
    return `Você é um escritor de RPG. A estrutura fornecida já foi validada. Aprofunde sua identidade sem mudar IDs, fatos estabelecidos, conexões, classes ou regras.
Escreva em português brasileiro natural, com ritmo, imagens concretas e coerência cultural. Dê história e consequências às escolhas de cenário. Relacione o conflito a interesses humanos, disputas e acontecimentos do passado, evitando o clichê de uma ameaça genérica.
Ambientes devem ter identidade: sons, luz, materiais, clima, costumes e sinais de vida. NPCs precisam de desejo, contradição, modo de falar e uma motivação compreensível. Classes devem ter papel social e origem, não apenas um adjetivo. O prelúdio deve apresentar uma cena viva, com tensão e espaço para a primeira decisão do jogador.
Não transforme a resposta em um resumo telegráfico. Use parágrafos completos. Profundidade vem de detalhes específicos e conexões, não de repetir adjetivos. Não decida ações, sentimentos ou falas do jogador.
Você tem até ${limite} tokens para o objeto inteiro. Dê mais espaço ao prelúdio, aos ambientes e à situação atual; reduza repetições em outros campos. Preserve a quantidade de entradas em cada lista e conclua todo o JSON.
${LIMITES_CRIATIVOS}
Responda apenas JSON com exatamente as chaves do modelo fornecido. Não acrescente atributos, itens, recompensas, poderes ou campos mecânicos.`;
}

function aplicarAprofundamento(mundo, resposta) {
    const modelo = modeloAprofundamento(mundo);
    function conferir(valor, exemplo) {
        if (Array.isArray(exemplo)) {
            if (!Array.isArray(valor) || valor.length !== exemplo.length) throw new Error('O aprofundamento alterou a quantidade de elementos do mundo.');
            valor.forEach((item, indice) => {
                if (item?.id !== exemplo[indice].id) throw new Error('O aprofundamento alterou IDs ou a ordem do mundo.');
                conferir(item, exemplo[indice]);
            });
        } else if (exemplo && typeof exemplo === 'object') {
            if (!valor || typeof valor !== 'object' || Array.isArray(valor) || Object.keys(valor).length !== Object.keys(exemplo).length || Object.keys(valor).some((chave) => !Object.hasOwn(exemplo, chave))) throw new Error('O aprofundamento devolveu campos não permitidos.');
            for (const chave of Object.keys(exemplo)) conferir(valor[chave], exemplo[chave]);
        } else if (typeof valor !== 'string' || !valor.trim() || valor.length > 12000) throw new Error('Descrição inválida no aprofundamento.');
    }
    conferir(resposta, modelo);
    const aprofundado = structuredClone(mundo);
    aprofundado.mundo.descricao = resposta.descricao_mundo;
    Object.assign(aprofundado.historia, resposta.historia);
    for (const colecao of ['classes', 'ambientes', 'personagens']) {
        resposta[colecao].forEach((item, indice) => Object.assign(aprofundado[colecao][indice], item));
    }
    return aprofundado;
}

module.exports = { modeloAprofundamento, criarEsquema, criarPromptAprofundamento, aplicarAprofundamento };
