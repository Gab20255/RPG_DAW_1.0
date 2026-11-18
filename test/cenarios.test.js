const { test } = require('node:test');
const assert = require('node:assert/strict');
const { statSync } = require('node:fs');
const { join } = require('node:path');
const { BASES_RPG } = require('../src/data/basesRpg');
const { CATALOGO_CENARIOS, listarCenarios, obterCenario } = require('../src/data/catalogoCenarios');

test('o catálogo cobre C01–C30 e cada cenário aponta para um arquivo público', () => {
    const codigos = Array.from({ length: 30 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
    const temasValidos = new Set(BASES_RPG.map(base => base.id));
    assert.deepEqual(CATALOGO_CENARIOS.map(cenario => cenario.id).sort(), codigos);

    for (const cenario of CATALOGO_CENARIOS) {
        assert.ok(cenario.nome.trim() && cenario.descricao.trim(), cenario.id);
        assert.ok(cenario.temas.length && cenario.temas.every(tema => temasValidos.has(tema)), cenario.id);
        assert.ok(cenario.tipos.length, cenario.id);
        assert.equal(cenario.url, `/avatares/${cenario.id}.jpeg`);
        assert.ok(statSync(join(__dirname, '../public', cenario.url)).isFile(), cenario.id);
    }
    for (const tema of temasValidos) {
        const principais = CATALOGO_CENARIOS.filter(cenario => cenario.temas[0] === tema);
        assert.equal(principais.length, 6, tema);
        assert.ok(principais.some(cenario => cenario.tipos.includes('interior')), tema);
        assert.ok(principais.some(cenario => cenario.tipos.includes('exterior')), tema);
    }
});

test('combina tema e tipo e prioriza a classificação principal', () => {
    assert.equal(listarCenarios().length, 30);
    assert.deepEqual(listarCenarios({ tema: 'fantasia_medieval', tipo: 'Floresta' }).map(c => c.id), ['C03', 'C10']);
    assert.equal(listarCenarios({ tema: 'investigacao_contemporanea', tipo: 'Galpão' })[0].id, 'C22');
    assert.equal(listarCenarios({ tema: 'ficcao_cientifica', tipo: 'Arquivo digital' })[0].id, 'C14');
    assert.equal(listarCenarios({ tema: 'pos_apocalipse', tipo: 'ruína' })[0].id, 'C30');
    assert.deepEqual(listarCenarios({ tema: 'ficcao_cientifica', tipo: 'catacumba' }), []);
    assert.deepEqual(listarCenarios({ tema: 'tema_desconhecido' }), []);
});

test('resolve o identificador persistido para uma imagem do catálogo', () => {
    assert.equal(obterCenario('C18').url, '/avatares/C18.jpeg');
    assert.equal(obterCenario('C31'), null);
});
