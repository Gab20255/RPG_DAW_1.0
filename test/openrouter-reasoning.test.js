const { test } = require('node:test');
const assert = require('node:assert/strict');
const GeminiService = require('../src/services/geminiService');
const { MODELO_MUNDO } = require('../src/prompts/mundoPrompt');

function simularResposta(t, data) {
    return t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => data }));
}

test('DeepSeek gera mundo sem thinking, respeitando o limite e validando o JSON', async (t) => {
    const mundo = structuredClone(MODELO_MUNDO);
    const chamada = simularResposta(t, {
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(mundo) } }],
        usage: { completion_tokens: 2500, completion_tokens_details: { reasoning_tokens: 0 } },
    });
    const api = new GeminiService({ openrouterKey: 'teste', model: 'deepseek/deepseek-v4-flash-0731', worldMaxTokens: 2750 });
    assert.deepEqual(await api.gerarMundo('Mundo de teste'), mundo);
    const body = JSON.parse(chamada.mock.calls[0].arguments[1].body);
    assert.equal(body.model, 'deepseek/deepseek-v4-flash-0731');
    assert.deepEqual(body.reasoning, { enabled: false });
    assert.equal(body.max_tokens, 2750);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    const schema = body.response_format.json_schema.schema;
    assert.ok(schema.properties.mundo.required.includes('ambiente_inicial_id'));
    assert.ok(schema.properties.historia.required.includes('eventos_historicos'));
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.properties.faccoes.items.properties.aliados_ids.items, { type: 'string' });
    assert.deepEqual(body.provider, { require_parameters: true, sort: 'throughput', ignore: ['Baidu'] });
    assert.equal(chamada.mock.callCount(), 1);
    assert.deepEqual(api.chatHistory, []);
});

test('DeepSeek narra resultado oficial com thinking desligado e limite proprio', async (t) => {
    const resposta = { resultado_id: 'r1', personagem_id: 'p1', ambiente_id: 'a1', narracao: 'A porta continua fechada.', propostas: [] };
    const chamada = simularResposta(t, { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(resposta) } }] });
    const api = new GeminiService({ openrouterKey: 'teste', model: 'deepseek/deepseek-v4-flash-0731', narrationMaxTokens: 900 });
    assert.deepEqual(await api.narrarResultado({ resultado: { id: 'r1' }, personagem: { id: 'p1' }, cena: { id: 'a1' } }), resposta);
    const body = JSON.parse(chamada.mock.calls[0].arguments[1].body);
    assert.deepEqual(body.reasoning, { enabled: false });
    assert.equal(body.max_tokens, 900);
});

test('raciocinio esgotado nao repete a chamada nem aceita mundo vazio', async (t) => {
    const chamada = simularResposta(t, {
        choices: [{ finish_reason: 'length', message: { content: '' } }],
        usage: { completion_tokens: 2750, completion_tokens_details: { reasoning_tokens: 2750 } },
    });
    const api = new GeminiService({ openrouterKey: 'teste', model: 'deepseek/deepseek-v4-flash-0731', worldMaxTokens: 2750 });
    await assert.rejects(api.gerarMundo('Teste'), (error) => {
        assert.equal(error.code, 'MUNDO_TRUNCADO');
        assert.match(error.message, /tokens de raciocinio: 2750/);
        assert.match(error.message, /sem produzir texto/);
        assert.equal(error.diagnostico.resposta_parcial, '');
        assert.equal(error.diagnostico.tokens_raciocinio, 2750);
        assert.ok(!JSON.stringify(error.diagnostico).includes('Authorization'));
        return true;
    });
    assert.equal(chamada.mock.callCount(), 1);
});

test('JSON truncado continua rejeitado mesmo com raciocinio desligado', async (t) => {
    const chamada = simularResposta(t, {
        choices: [{ finish_reason: 'length', message: { content: '{"versao":"1.0"' } }],
        usage: { completion_tokens: 2750, completion_tokens_details: { reasoning_tokens: 0 } },
    });
    const api = new GeminiService({ openrouterKey: 'teste', model: 'deepseek/deepseek-v4-flash-0731', worldMaxTokens: 2750 });
    await assert.rejects(api.gerarMundo('Teste'), { code: 'MUNDO_TRUNCADO' });
    assert.equal(chamada.mock.callCount(), 1);
});

test('Gemini preserva a configuracao e outros modelos nao recebem controle incompatível', async (t) => {
    const chamada = simularResposta(t, { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] });
    for (const [model, esperado] of [['google/gemini-2.5-flash', { enabled: false }], ['deepseek/deepseek-r1', undefined]]) {
        const api = new GeminiService({ openrouterKey: 'teste', model });
        await api._enviarOpenRouter('Teste', 1, { json: true, maxTokens: 3000 });
        const body = JSON.parse(chamada.mock.calls.at(-1).arguments[1].body);
        assert.deepEqual(body.reasoning, esperado);
    }
});
