// O primeiro tema e o primeiro tipo descrevem o encaixe principal da imagem.
// Os demais permitem reaproveitar a mesma arte em locais parecidos.
const definicoes = [
    ['C01', 'Praça da vila', 'Casas de pedra e madeira cercam uma praça de paralelepípedos com bancas de toldo e um poço coberto.',
        ['fantasia_medieval'], ['povoado', 'praca', 'mercado', 'entreposto', 'exterior']],
    ['C02', 'Salão da hospedaria', 'Mesas compridas e bancos dividem um salão de madeira com balcão, lareira acesa e escada para o andar superior.',
        ['fantasia_medieval', 'fantasia_sombria'], ['hospedaria', 'taverna', 'ponto_de_encontro', 'interior']],
    ['C03', 'Trilha na floresta', 'Trilha de terra entre árvores altas, pedras cobertas de musgo e samambaias, com luz filtrada pela copa.',
        ['fantasia_medieval', 'fantasia_sombria', 'investigacao_contemporanea'], ['floresta', 'trilha', 'exterior']],
    ['C04', 'Galeria de pedra', 'Corredor de pedra com arcos, colunas e tochas nas paredes, que levam a uma passagem escura ao fundo.',
        ['fantasia_medieval', 'fantasia_sombria'], ['corredor', 'passagem', 'fortaleza', 'ruina', 'interior']],
    ['C05', 'Cais antigo', 'Cais de tábuas à beira de água calma, com barcos pequenos, cordas, barris e uma fileira de armazéns.',
        ['fantasia_medieval', 'fantasia_sombria'], ['porto', 'cais', 'entreposto', 'exterior']],
    ['C06', 'Pátio do deserto', 'Pátio de pedra e barro com toldos, jarros e palmeiras. Um portal em arco se abre para as dunas.',
        ['fantasia_medieval'], ['deserto', 'povoado', 'mercado', 'posto', 'exterior']],
    ['C07', 'Aldeia na névoa', 'Rua de pedras entre casas escuras de telhados inclinados. Cercas baixas e uma camada de névoa fecham a perspectiva.',
        ['fantasia_sombria', 'fantasia_medieval'], ['povoado', 'rua', 'exterior']],
    ['C08', 'Nave do santuário', 'Salão de pedra com fileiras de bancos, arcos altos, altar e janelas estreitas que deixam entrar luz fria.',
        ['fantasia_sombria', 'fantasia_medieval'], ['santuario', 'templo', 'capela', 'interior']],
    ['C09', 'Catacumbas abobadadas', 'Corredor subterrâneo com arcos sucessivos, nichos gradeados, tochas e uma escada ao fundo.',
        ['fantasia_sombria', 'fantasia_medieval'], ['catacumba', 'subterraneo', 'ruina', 'passagem', 'interior']],
    ['C10', 'Bosque pantanoso', 'Tábuas estreitas cruzam poças entre raízes expostas e árvores retorcidas, cobertas por névoa cinzenta.',
        ['fantasia_sombria', 'fantasia_medieval', 'pos_apocalipse'], ['pantano', 'floresta', 'trilha', 'exterior']],
    ['C11', 'Biblioteca antiga', 'Estantes altas e escadas de madeira ocupam uma biblioteca de pedra com janelas em arco e uma mesa de leitura.',
        ['fantasia_sombria', 'fantasia_medieval'], ['biblioteca', 'arquivo', 'interior']],
    ['C12', 'Refúgio de pedra', 'Salão baixo com lareira, mesas, sacos de provisões, barris e uma porta larga de madeira ao fundo.',
        ['fantasia_sombria', 'fantasia_medieval'], ['abrigo', 'deposito', 'ponto_de_encontro', 'interior']],
    ['C13', 'Corredor de estação', 'Corredor metálico comprido, com portas modulares nas duas laterais e fileiras de luz branca no teto.',
        ['ficcao_cientifica'], ['corredor', 'estacao', 'instalacao', 'passagem', 'interior']],
    ['C14', 'Centro de comando', 'Sala escura com consoles, monitores azulados e uma grande janela emoldurando o espaço e um planeta.',
        ['ficcao_cientifica'], ['centro_de_comando', 'estacao', 'arquivo_digital', 'posto', 'interior']],
    ['C15', 'Laboratório tecnológico', 'Bancadas claras com computadores e equipamentos de análise ladeiam um laboratório de iluminação branca.',
        ['ficcao_cientifica'], ['laboratorio', 'enfermaria', 'instalacao', 'interior']],
    ['C16', 'Hangar de manutenção', 'Galpão metálico com trilhos no piso, caixas, bancadas e um grande portão iluminado ao fundo.',
        ['ficcao_cientifica', 'pos_apocalipse'], ['hangar', 'oficina', 'galpao', 'instalacao', 'interior']],
    ['C17', 'Rua futurista', 'Rua molhada entre fachadas estreitas e escuras, com cabos aéreos e letreiros luminosos em azul e laranja.',
        ['ficcao_cientifica'], ['rua', 'beco', 'cidade', 'exterior']],
    ['C18', 'Posto em terreno rochoso', 'Módulos baixos e pequenas instalações espalhadas num vale seco, entre rochas e montanhas distantes.',
        ['ficcao_cientifica', 'pos_apocalipse'], ['posto', 'assentamento', 'deserto', 'exterior']],
    ['C19', 'Rua comercial', 'Via asfaltada entre lojas, cafés e prédios baixos, com carros estacionados, calçadas arborizadas e céu nublado.',
        ['investigacao_contemporanea'], ['rua', 'cidade', 'comercio', 'ponto_de_encontro', 'exterior']],
    ['C20', 'Escritório de investigação', 'Mesa com papéis e luminária, mural de recortes, armários para documentos e uma janela com persianas.',
        ['investigacao_contemporanea'], ['escritorio', 'arquivo', 'delegacia', 'interior']],
    ['C21', 'Sala de estar', 'Cômodo residencial com sofá azul, luminária, mesa de centro, estante e acesso à sala ao lado.',
        ['investigacao_contemporanea'], ['residencia', 'sala_de_estar', 'interior']],
    ['C22', 'Armazém industrial', 'Corredor central de um galpão com estantes cheias de caixas, piso de concreto, tesouras metálicas e claraboias.',
        ['investigacao_contemporanea', 'pos_apocalipse'], ['galpao', 'deposito', 'armazem', 'interior']],
    ['C23', 'Consultório', 'Sala clara com maca azul, bancada com computador, armários de madeira e uma janela ao lado da porta.',
        ['investigacao_contemporanea'], ['clinica', 'enfermaria', 'consultorio', 'interior']],
    ['C24', 'Estrada rural isolada', 'Estrada de terra molhada contorna um galpão de madeira com cerca baixa, à beira de uma floresta sob nuvens.',
        ['investigacao_contemporanea', 'pos_apocalipse', 'fantasia_sombria'], ['estrada', 'zona_rural', 'floresta', 'exterior']],
    ['C25', 'Avenida abandonada', 'Avenida de asfalto rachado cercada por prédios degradados, com vegetação crescendo pela rua e pelas fachadas.',
        ['pos_apocalipse'], ['rua', 'cidade', 'ruina', 'exterior']],
    ['C26', 'Abrigo subterrâneo', 'Passagem de concreto com beliches, prateleiras, tubulações aparentes e uma escada iluminada ao fundo.',
        ['pos_apocalipse'], ['abrigo', 'subterraneo', 'passagem', 'interior']],
    ['C27', 'Oficina do abrigo', 'Oficina de concreto com bancada cheia de peças, ferramentas penduradas, estantes e lâmpadas expostas.',
        ['pos_apocalipse', 'investigacao_contemporanea'], ['oficina', 'abrigo', 'instalacao', 'interior']],
    ['C28', 'Assentamento protegido', 'Pátio cercado por construções reaproveitadas, com canteiros de horta, barris, paliçadas e um portão ao fundo.',
        ['pos_apocalipse'], ['assentamento', 'povoado', 'abrigo', 'exterior']],
    ['C29', 'Ermo rochoso', 'Trilha seca serpenteando entre pedras e vegetação baixa, com vestígios de ruínas ao longe.',
        ['pos_apocalipse', 'fantasia_medieval', 'ficcao_cientifica'], ['deserto', 'trilha', 'ruina', 'exterior']],
    ['C30', 'Instalação tomada pela vegetação', 'Grande corredor abandonado com janelas em arco, raízes, plantas no chão e claraboias danificadas.',
        ['pos_apocalipse', 'fantasia_sombria', 'investigacao_contemporanea'], ['ruina', 'instalacao', 'corredor', 'interior']],
];

const CATALOGO_CENARIOS = Object.freeze(definicoes.map(([id, nome, descricao, temas, tipos]) => Object.freeze({
    id, nome, descricao,
    temas: Object.freeze(temas),
    tipos: Object.freeze(tipos),
    url: `/avatares/${id}.jpeg`,
})));

function normalizarTipo(tipo) {
    return tipo.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function listarCenarios({ tema, tipo } = {}) {
    const tipoNormalizado = tipo === undefined ? undefined : normalizarTipo(tipo);
    const candidatos = CATALOGO_CENARIOS.filter(cenario =>
        (tema === undefined || cenario.temas.includes(tema)) &&
        (tipoNormalizado === undefined || cenario.tipos.includes(tipoNormalizado)));
    if (tema === undefined && tipoNormalizado === undefined) return candidatos;

    const prioridade = cenario => Number(tema !== undefined && cenario.temas[0] === tema) * 2
        + Number(tipoNormalizado !== undefined && cenario.tipos[0] === tipoNormalizado);
    return candidatos.sort((a, b) => prioridade(b) - prioridade(a));
}

function obterCenario(id) {
    return CATALOGO_CENARIOS.find(cenario => cenario.id === id) ?? null;
}

module.exports = { CATALOGO_CENARIOS, listarCenarios, obterCenario };
