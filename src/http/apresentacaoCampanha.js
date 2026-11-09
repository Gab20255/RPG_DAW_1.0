const { obterMundoCampanha } = require('../services/campanhaService');
const { hashBaseCampanha } = require('../services/participantesCampanhaService');
const { prepararEstadoMecanico, apresentarResultadoMecanico, idJogador } = require('../services/combateService');

function selecionar(campos, objeto) {
    return Object.fromEntries(campos.filter(campo => Object.hasOwn(objeto, campo)).map(campo => [campo, structuredClone(objeto[campo])]));
}

function apresentarCena(cena) {
    return cena ? { ...selecionar(['id', 'turno', 'acao', 'tipo', 'ambiente_id', 'participante_id', 'personagem_id', 'teste', 'narracao', 'resumo', 'exige_resolucao_mecanica'], cena), resultado: apresentarResultadoMecanico(cena.resultado) } : null;
}

function apresentarFicha(ficha) {
    return selecionar(['id', 'nome', 'classe_id', 'classe', 'raca_id', 'raca', 'descricao_visual', 'avatar_id', 'avatar_url', 'nivel', 'vida', 'vida_max', 'energia', 'energia_max', 'atributos', 'habilidades', 'versao_regras'], ficha);
}

function resumirCampanha(mundo) {
    const campanha = mundo.campanha;
    return { id: campanha.id, titulo: mundo.mundo.nome, turno: campanha.turno, estado: campanha.estado,
        participantes: campanha.participantes.length, cena_pendente: Boolean(campanha.pendente),
        base: mundo.origem?.base_nome || null };
}

function apresentarCampanha(mundo) {
    const campanha = mundo.campanha;
    const atual = obterMundoCampanha(mundo, campanha);
    const mecanica = prepararEstadoMecanico(campanha, atual);
    const colecoes = {
        classes: ['id', 'nome', 'descricao', 'bonus_atributos', 'habilidades', 'itens_iniciais_ids'],
        racas: ['id', 'nome', 'descricao', 'tracos'],
        faccoes: ['id', 'nome', 'descricao', 'objetivo', 'aliados_ids', 'rivais_ids'],
        personagens: ['id', 'nome', 'papel', 'descricao', 'aparencia', 'ambiente_id', 'faccoes_ids'],
        ambientes: ['id', 'nome', 'tipo', 'descricao', 'importancia', 'conexoes_ids', 'personagens_ids'],
        itens: ['id', 'nome', 'tipo', 'descricao', 'efeito', 'raridade', 'ambiente_id'],
        criaturas: ['id', 'nome', 'descricao', 'comportamento', 'ameaca', 'ambientes_ids'],
        missoes: ['id', 'titulo', 'tipo', 'descricao', 'objetivo', 'ambientes_ids', 'personagens_ids', 'recompensas'],
    };
    return {
        ...resumirCampanha(mundo),
        versao: campanha.versao, revisao: mundo.revisaoPersistencia ?? null, mundo_hash: hashBaseCampanha(mundo),
        abertura: mundo.historia.preludio, resumo: campanha.resumo, ambiente_id: campanha.ambiente_id,
        direcao: selecionar(['conflito', 'objetivo', 'gancho'], campanha.direcao),
        direcao_definida: campanha.direcao_definida,
        objetivos: structuredClone(campanha.objetivos), memoria: structuredClone(campanha.memoria),
        participantes: campanha.participantes.map(({ id, ficha, ingresso_no_turno }) => {
            const estado = mecanica.combatentes.find(item => item.id === idJogador(id));
            return { id, ingresso_no_turno, ficha: { ...apresentarFicha(ficha), vida: estado.vida, energia: estado.energia,
                inventario: ficha.inventario.map(item => selecionar(colecoes.itens, item)) } };
        }),
        mecanica: { encontro: mecanica.encontro, combatentes: mecanica.combatentes.filter(item => item.ambiente_id === campanha.ambiente_id) },
        pendente: apresentarCena(campanha.pendente), ultima_cena: apresentarCena(campanha.diario.at(-1)), desfecho: campanha.desfecho,
        preparacao: { selecao: mundo.origem?.selecao || null, adaptacao: mundo.preparacao?.adaptacao || null },
        mundo: {
            ...selecionar(['nome', 'tema', 'tom', 'descricao', 'regras_do_universo', 'ambiente_inicial_id'], atual.mundo),
            ...Object.fromEntries(Object.entries(colecoes).map(([colecao, campos]) => [colecao, atual[colecao].map(item => selecionar(campos, item))])),
        },
    };
}

module.exports = { apresentarCampanha, resumirCampanha, apresentarCena };
