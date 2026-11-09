const TEMAS = {
    fantasia_medieval: { nome: 'Fantasia medieval', fundo: '#172e32', cor: '#c5a665', roupa: '#335451', detalhe: '#e7d8a5' },
    fantasia_sombria: { nome: 'Fantasia sombria', fundo: '#242035', cor: '#b5a1d6', roupa: '#453950', detalhe: '#dbb9c5' },
    ficcao_cientifica: { nome: 'Ficção científica', fundo: '#102937', cor: '#72dfd2', roupa: '#274959', detalhe: '#8be6ee' },
    investigacao_contemporanea: { nome: 'Investigação contemporânea', fundo: '#262f3b', cor: '#dbb175', roupa: '#4b596b', detalhe: '#f1d0a0' },
    pos_apocalipse: { nome: 'Pós-apocalipse', fundo: '#302a22', cor: '#d3a674', roupa: '#635a40', detalhe: '#e7bf87' },
};

const MODELOS = [
    ['medieval_guardiao', 'fantasia_medieval', 'classe_1', 'Guardião de aço', 'Armadura, ombreiras e cabelo curto.', 'armadura', 'curto', 'espada', ['armadura', 'metal', 'ombreiras'], ['guerreiro', 'guardiao', 'cavaleiro'], '#b98261'],
    ['medieval_arcano', 'fantasia_medieval', 'classe_2', 'Estudioso arcano', 'Manto com capuz e broche de cristal.', 'manto', 'capuz', 'cristal', ['manto', 'capuz', 'cristal'], ['mago', 'arcano', 'feiticeiro'], '#d9aa83'],
    ['medieval_viajante', 'fantasia_medieval', 'classe_3', 'Viajante das sombras', 'Capa de couro, cabelo preso e lenço.', 'capa', 'preso', 'adaga', ['couro', 'lenco', 'capa'], ['ladino', 'batedor', 'explorador'], '#80543f'],
    ['medieval_cuidador', 'fantasia_medieval', 'classe_4', 'Cuidador do templo', 'Túnica clara, cabelos longos e medalhão.', 'tunica', 'longo', 'folha', ['tunica', 'medalhao', 'cabelos longos'], ['clerigo', 'curandeiro', 'sacerdote'], '#b87655'],
    ['sombrio_sentinela', 'fantasia_sombria', 'classe_1', 'Sentinela da névoa', 'Armadura escura, cicatriz e cabelo curto.', 'armadura', 'cicatriz', 'espada', ['armadura', 'cicatriz', 'escura'], ['guerreiro', 'sentinela', 'guardiao'], '#bd967a'],
    ['sombrio_rastreador', 'fantasia_sombria', 'classe_2', 'Rastreador noturno', 'Capuz, capa e fecho de couro.', 'capa', 'capuz', 'adaga', ['capuz', 'capa', 'couro'], ['cacador', 'rastreador', 'batedor'], '#865a46'],
    ['sombrio_ocultista', 'fantasia_sombria', 'classe_3', 'Pesquisador do oculto', 'Manto, cabelos longos e amuleto violeta.', 'manto', 'longo', 'cristal', ['manto', 'amuleto', 'cabelos longos'], ['ocultista', 'mago', 'pesquisador'], '#a77d69'],
    ['sombrio_curandeiro', 'fantasia_sombria', 'classe_4', 'Cuidador do refúgio', 'Túnica de viagem, óculos e bolsa de curativos.', 'tunica', 'oculos', 'folha', ['tunica', 'oculos', 'curativos'], ['curandeiro', 'cuidador', 'medico'], '#d5ac91'],
    ['orbital_soldado', 'ficcao_cientifica', 'classe_1', 'Soldado orbital', 'Proteção rígida, visor luminoso e gola reforçada.', 'armadura', 'visor', 'escudo', ['visor', 'armadura', 'protecao'], ['soldado', 'combatente', 'seguranca'], '#99694f'],
    ['orbital_engenheiro', 'ficcao_cientifica', 'classe_2', 'Engenheiro de sistemas', 'Jaqueta técnica, óculos e ferramenta no peito.', 'jaqueta', 'oculos', 'chave', ['oculos', 'jaqueta', 'ferramenta'], ['engenheiro', 'hacker', 'tecnico'], '#cf9a74'],
    ['orbital_batedor', 'ficcao_cientifica', 'classe_3', 'Explorador orbital', 'Traje leve, cabelo preso e comunicador.', 'capa', 'preso', 'bussola', ['traje leve', 'cabelo preso', 'comunicador'], ['batedor', 'explorador', 'piloto'], '#83513d'],
    ['orbital_medico', 'ficcao_cientifica', 'classe_4', 'Médico de bordo', 'Uniforme claro, cabelo curto e símbolo de cuidado.', 'tunica', 'curto', 'folha', ['uniforme', 'cabelo curto', 'claro'], ['medico', 'cuidador', 'cientista'], '#d0aa8a'],
    ['urbano_investigador', 'investigacao_contemporanea', 'classe_1', 'Investigador de rua', 'Casaco de gola alta, óculos e caderno.', 'casaco', 'oculos', 'lupa', ['casaco', 'oculos', 'caderno'], ['investigador', 'detetive', 'perito'], '#a97452'],
    ['urbano_policial', 'investigacao_contemporanea', 'classe_2', 'Agente de proteção', 'Colete, cabelo curto e distintivo.', 'armadura', 'curto', 'escudo', ['colete', 'cabelo curto', 'distintivo'], ['policial', 'agente', 'seguranca'], '#d2a17d'],
    ['urbano_jornalista', 'investigacao_contemporanea', 'classe_3', 'Repórter de campo', 'Jaqueta, cabelos longos e identificação de imprensa.', 'jaqueta', 'longo', 'caderno', ['jaqueta', 'cabelos longos', 'imprensa'], ['jornalista', 'reporter', 'comunicador'], '#7d503b'],
    ['urbano_medico', 'investigacao_contemporanea', 'classe_4', 'Socorrista', 'Jaleco, cabelo preso e material de atendimento.', 'tunica', 'preso', 'folha', ['jaleco', 'cabelo preso', 'atendimento'], ['medico', 'socorrista', 'enfermeiro'], '#bc866b'],
    ['ruinas_protetor', 'pos_apocalipse', 'classe_1', 'Protetor das ruínas', 'Armadura reaproveitada, cicatriz e faixa no ombro.', 'armadura', 'cicatriz', 'escudo', ['armadura', 'cicatriz', 'faixa'], ['soldado', 'protetor', 'guerreiro'], '#9e6b4d'],
    ['ruinas_mecanico', 'pos_apocalipse', 'classe_2', 'Mecânico do abrigo', 'Jaqueta remendada, óculos e ferramentas.', 'jaqueta', 'oculos', 'chave', ['jaqueta', 'oculos', 'ferramentas'], ['mecanico', 'engenheiro', 'tecnico'], '#d1a17a'],
    ['ruinas_batedor', 'pos_apocalipse', 'classe_3', 'Batedor do ermo', 'Capa de viagem, máscara contra poeira e capuz.', 'capa', 'mascara', 'bussola', ['capa', 'mascara', 'capuz'], ['batedor', 'rastreador', 'explorador'], '#85543e'],
    ['ruinas_medico', 'pos_apocalipse', 'classe_4', 'Cuidador do abrigo', 'Túnica remendada, cabelo preso e estojo de curativos.', 'tunica', 'preso', 'folha', ['tunica', 'cabelo preso', 'curativos'], ['medico', 'cuidador', 'curandeiro'], '#bc9376'],
];

const AVATARES = Object.freeze(MODELOS.map(([id, base_id, classe_id, nome, descricao, traje, cabelo, simbolo, aparencia, classes, pele]) => Object.freeze({
    id, base_id, classe_id, nome, descricao, traje, cabelo, simbolo, pele,
    aparencia: Object.freeze(aparencia), classes: Object.freeze(classes),
    paleta: Object.freeze({ ...TEMAS[base_id] }), url: `/avatares/v1/${id}.svg`,
})));

module.exports = { AVATARES };
