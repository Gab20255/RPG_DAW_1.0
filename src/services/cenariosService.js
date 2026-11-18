const { listarCenarios } = require('../data/catalogoCenarios');

const PALAVRAS_COMUNS = new Set(['uma', 'umas', 'este', 'esta', 'para', 'como', 'mais', 'sobre', 'entre', 'cada', 'pelo', 'pela', 'suas', 'seus', 'lado', 'fundo']);

function normalizar(texto = '') {
    return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function palavras(texto) {
    return new Set(normalizar(texto).split(' ')
        .filter(palavra => palavra.length >= 4 && !PALAVRAS_COMUNS.has(palavra))
        .map(palavra => palavra.replace(/(\w{4})s$/, '$1')));
}

function contarCorrespondencias(palavrasLocal, palavrasImagem) {
    let total = 0;
    for (const palavra of palavrasLocal) {
        if (palavrasImagem.has(palavra)) total++;
    }
    return total;
}

const indice = new Map(listarCenarios().map(cenario => [cenario.id, {
    nomeETipos: palavras(`${cenario.nome} ${cenario.tipos.join(' ')}`),
    descricao: palavras(cenario.descricao),
}]));

function selecionarCenario({ tema, ambiente }) {
    const doTema = listarCenarios({ tema });
    const candidatos = doTema.length ? doTema : listarCenarios();
    const tipo = normalizar(ambiente.tipo);
    const nome = palavras(ambiente.nome);
    const descricao = palavras(ambiente.descricao);
    let melhor = candidatos[0];
    let maiorPontuacao = -1;

    for (const cenario of candidatos) {
        const { nomeETipos, descricao: descricaoImagem } = indice.get(cenario.id);
        // O tipo do local vale mais que palavras incidentais da descrição.
        const tipoPrincipal = tipo === normalizar(cenario.tipos[0]);
        const tipoCompativel = cenario.tipos.some(categoria => tipo === normalizar(categoria));
        const pontuacao = (tipoPrincipal ? 18 : tipoCompativel ? 14 : 0)
            + contarCorrespondencias(nome, nomeETipos) * 5
            + contarCorrespondencias(descricao, nomeETipos) * 3
            + contarCorrespondencias(descricao, descricaoImagem);
        if (pontuacao > maiorPontuacao) {
            melhor = cenario;
            maiorPontuacao = pontuacao;
        }
    }

    // A ordem do catálogo prefere o tema principal e resolve empates de forma estável.
    return melhor;
}

module.exports = { selecionarCenario };
