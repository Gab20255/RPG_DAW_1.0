const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BASES_RPG } = require('../src/data/basesRpg');
const { selecionarCenario } = require('../src/services/cenariosService');

test('escolhe uma imagem adequada aos locais das campanhas prontas', () => {
    const casos = [
        ['fantasia_medieval', 'Entreposto', 'C01'],
        ['fantasia_medieval', 'Arquivo dos viajantes', 'C11'],
        ['fantasia_sombria', 'Refúgio', 'C12'],
        ['ficcao_cientifica', 'Terminal público', 'C14'],
        ['investigacao_contemporanea', 'Galpão desativado', 'C22'],
        ['pos_apocalipse', 'Oficina', 'C27'],
    ];
    for (const [tema, nome, esperado] of casos) {
        const ambiente = BASES_RPG.find(base => base.id === tema).mundo.ambientes.find(local => local.nome === nome);
        assert.equal(selecionarCenario({ tema, ambiente }).id, esperado, nome);
    }
});

test('distingue dois lugares do mesmo tipo pelo nome e pela descrição', () => {
    const tema = 'pos_apocalipse';
    const instalacao = { tipo: 'ruína', nome: 'Instalação tomada pela vegetação', descricao: 'Um corredor abandonado entre raízes e claraboias danificadas.' };
    const avenida = { tipo: 'ruína', nome: 'Avenida abandonada', descricao: 'Asfalto rachado, prédios degradados e vegetação pelas fachadas.' };
    assert.equal(selecionarCenario({ tema, ambiente: instalacao }).id, 'C30');
    assert.equal(selecionarCenario({ tema, ambiente: avenida }).id, 'C25');
});

test('usa a descrição de locais descobertos e tem saída para mundos sem tema no catálogo', () => {
    const ambiente = { tipo: 'local descoberto', nome: 'Clareira de Nara', descricao: 'Uma trilha na floresta, entre árvores altas, musgo e samambaias.' };
    assert.equal(selecionarCenario({ tema: 'fantasia_medieval', ambiente }).id, 'C03');
    assert.equal(selecionarCenario({ tema: 'tema_livre', ambiente }).id, 'C03');

    const semPistas = { tipo: 'local descoberto', nome: 'Nara', descricao: 'Uma visita inesperada.' };
    const fallback = selecionarCenario({ tema: 'ficcao_cientifica', ambiente: semPistas });
    assert.equal(fallback.temas[0], 'ficcao_cientifica');
    assert.equal(selecionarCenario({ tema: 'ficcao_cientifica', ambiente: semPistas }).id, fallback.id);
});
