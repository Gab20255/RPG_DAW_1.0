const { validarPersonagem } = require('./personagemService');
const { hashMundo } = require('../terminal/arquivos');
const { conferirCampos, conferirTexto } = require('../rules/narrativa');
const { validarTeste } = require('../rules/testes');

function hashBaseCampanha(mundo) {
    const base = structuredClone(mundo);
    delete base.campanha;
    delete base.preparacao;
    return hashMundo(base);
}

function validarIdentificador(id) {
    conferirTexto(id, 80, 'Participante');
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Identificador de participante inválido.');
}

function prepararFichaCampanha(ficha, mundo) {
    const hashBase = hashBaseCampanha(mundo);
    if (!ficha || ![hashBase, hashMundo(mundo)].includes(ficha.mundo_hash) || ficha.mundo_nome !== mundo.mundo.nome) throw new Error('Ficha de outro mundo ou sem identificação de origem.');
    const validada = validarPersonagem(ficha, mundo);
    return JSON.parse(JSON.stringify({ ...validada, mundo_hash: hashBase }));
}

function validarParticipantes(campanha, mundo) {
    if (!Array.isArray(campanha.participantes)) throw new Error('Participantes inválidos.');
    const ids = new Set(), fichas = new Set();
    const hashBase = hashBaseCampanha(mundo);
    for (const participante of campanha.participantes) {
        conferirCampos(participante, ['id', 'ficha', 'ingresso_no_turno'], 'Participante');
        validarIdentificador(participante.id);
        if (ids.has(participante.id) || fichas.has(participante.ficha?.id)) throw new Error('Participante ou ficha já vinculado.');
        if (!Number.isInteger(participante.ingresso_no_turno) || participante.ingresso_no_turno < 0 || participante.ingresso_no_turno > campanha.turno) throw new Error('Ingresso do participante inválido.');
        if (participante.ficha?.mundo_hash !== hashBase || participante.ficha.mundo_nome !== mundo.mundo.nome) throw new Error('Ficha incompatível com a campanha.');
        validarPersonagem(participante.ficha, mundo);
        ids.add(participante.id); fichas.add(participante.ficha.id);
    }
}

function obterParticipante(campanha, id) {
    const participantes = campanha.participantes || [];
    if (id === null || id === undefined) {
        if (!participantes.length) return null;
        if (participantes.length === 1) return participantes[0];
        throw new Error('Participante da ação não definido.');
    }
    validarIdentificador(id);
    const participante = participantes.find(item => item.id === id);
    if (!participante) throw new Error('Participante não vinculado à campanha.');
    return participante;
}

function conferirAutoria(cena, campanha) {
    if (/^\/teste(?:\s|$)/.test(cena.acao) && cena.tipo !== 'teste') throw new Error('Comando de teste sem resultado oficial.');
    if (cena.participante_id === null) {
        if (cena.personagem_id !== null || cena.teste !== null || cena.tipo === 'teste') throw new Error('Ação sem ficha não pode conter um teste.');
        return;
    }
    validarIdentificador(cena.participante_id);
    const participante = obterParticipante(campanha, cena.participante_id);
    if (!participante || cena.personagem_id !== participante.ficha.id || participante.ingresso_no_turno >= cena.turno) throw new Error('Autoria da cena inválida.');
    if (cena.tipo === 'teste') validarTeste(cena.teste, participante.ficha.atributos, cena.acao);
    else if (cena.teste !== null) throw new Error('Teste em ação incompatível.');
}

module.exports = { hashBaseCampanha, prepararFichaCampanha, validarParticipantes, validarIdentificador, obterParticipante, conferirAutoria };
