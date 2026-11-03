const { conferirCampos } = require('./narrativa');

const PERFIS_AMEACA = {
    baixa: { vida: 50, defesa: 11, ataque: 1, dano: 10 },
    media: { vida: 80, defesa: 13, ataque: 3, dano: 15 },
    alta: { vida: 120, defesa: 15, ataque: 5, dano: 20 },
};
const TIPOS_ACAO = ['ataque', 'habilidade', 'defesa', 'movimento', 'aproximacao', 'espera', 'descanso', 'fuga', 'preparacao'];
const TIPOS_EFEITO = ['barreira', 'lentidao', 'percepcao', 'marcacao'];
const LIMITE_POSICAO = 20;

function inteiro(valor, minimo, maximo, campo) {
    if (!Number.isSafeInteger(valor) || valor < minimo || valor > maximo) throw new Error(`${campo} inválido.`);
}

function validarEstadoMecanico(estado) {
    conferirCampos(estado, ['versao', 'combatentes', 'encontro'], 'Estado mecânico');
    if (estado.versao !== '1.0' || !Array.isArray(estado.combatentes)) throw new Error('Estado mecânico inválido.');
    const ids = new Set();
    for (const ator of estado.combatentes) {
        conferirCampos(ator, ['id', 'origem_id', 'tipo', 'nome', 'ambiente_id', 'vida', 'vida_max', 'energia', 'energia_max', 'defesa', 'ataque', 'dano', 'posicao', 'turnos', 'recargas', 'efeitos', 'preparacao'], 'Combatente');
        for (const campo of ['id', 'origem_id', 'nome', 'ambiente_id']) if (typeof ator[campo] !== 'string' || !ator[campo].trim() || ator[campo].length > 160) throw new Error('Identificação do combatente inválida.');
        if (ids.has(ator.id) || !['jogador', 'criatura', 'npc'].includes(ator.tipo)) throw new Error('Combatente duplicado ou inválido.');
        ids.add(ator.id);
        inteiro(ator.vida_max, 1, 120, 'Vida máxima'); inteiro(ator.vida, 0, ator.vida_max, 'Vida');
        inteiro(ator.energia_max, 0, 100, 'Energia máxima'); inteiro(ator.energia, 0, ator.energia_max, 'Energia');
        inteiro(ator.defesa, 1, 30, 'Defesa'); inteiro(ator.ataque, -5, 10, 'Ataque'); inteiro(ator.dano, 0, 80, 'Dano');
        inteiro(ator.posicao, 0, LIMITE_POSICAO, 'Posição'); inteiro(ator.turnos, 0, Number.MAX_SAFE_INTEGER - 20, 'Turnos');
        if (!Array.isArray(ator.recargas) || new Set(ator.recargas.map(item => item.habilidade_id)).size !== ator.recargas.length) throw new Error('Recargas inválidas.');
        for (const recarga of ator.recargas) {
            conferirCampos(recarga, ['habilidade_id', 'disponivel_no_turno'], 'Recarga');
            if (typeof recarga.habilidade_id !== 'string') throw new Error('Recarga inválida.');
            inteiro(recarga.disponivel_no_turno, 0, ator.turnos + 11, 'Recarga');
        }
        if (!Array.isArray(ator.efeitos) || new Set(ator.efeitos.map(item => item.tipo)).size !== ator.efeitos.length) throw new Error('Efeitos inválidos.');
        for (const efeito of ator.efeitos) {
            conferirCampos(efeito, ['tipo', 'valor', 'turnos'], 'Efeito');
            if (!TIPOS_EFEITO.includes(efeito.tipo)) throw new Error('Efeito desconhecido.');
            inteiro(efeito.valor, 0, 80, 'Potência'); inteiro(efeito.turnos, 1, 4, 'Duração');
        }
        if (ator.preparacao !== null && typeof ator.preparacao !== 'string') throw new Error('Preparação inválida.');
    }
    if (estado.encontro) {
        const encontro = estado.encontro;
        conferirCampos(encontro, ['ambiente_id', 'rodada', 'estado', 'inimigos_ids', 'participantes_ids', 'agiram_ids', 'retirados_ids'], 'Encontro');
        if (!['ativo', 'vitoria', 'derrota', 'fuga'].includes(encontro.estado)) throw new Error('Estado do encontro inválido.');
        inteiro(encontro.rodada, 1, Number.MAX_SAFE_INTEGER, 'Rodada');
        for (const campo of ['inimigos_ids', 'participantes_ids', 'agiram_ids', 'retirados_ids']) {
            const lista = encontro[campo];
            if (!Array.isArray(lista) || new Set(lista).size !== lista.length || lista.some(id => !ids.has(id))) throw new Error('Participantes do encontro inválidos.');
        }
        if (!encontro.inimigos_ids.length || !encontro.participantes_ids.length || encontro.inimigos_ids.length > 8 || encontro.inimigos_ids.some(id => estado.combatentes.find(ator => ator.id === id).tipo === 'jogador') || encontro.participantes_ids.some(id => estado.combatentes.find(ator => ator.id === id).tipo !== 'jogador') || [...encontro.agiram_ids, ...encontro.retirados_ids].some(id => !encontro.participantes_ids.includes(id))) throw new Error('Composição do encontro inválida.');
        if ([...encontro.inimigos_ids, ...encontro.participantes_ids].some(id => estado.combatentes.find(ator => ator.id === id).ambiente_id !== encontro.ambiente_id)) throw new Error('Combatente fora do encontro.');
    }
    return estado;
}

module.exports = { PERFIS_AMEACA, TIPOS_ACAO, LIMITE_POSICAO, validarEstadoMecanico };
