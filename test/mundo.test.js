const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const GeminiService = require('../src/services/geminiService');
const { MODELO_MUNDO, validarMundo } = require('../src/prompts/mundoPrompt');
const { main, obterConfig } = require('../src/chat-terminal');

const fixture = () => structuredClone(MODELO_MUNDO);
const servico = () => new GeminiService({ openrouterKey: 'chave-de-teste', model: 'modelo:free' });
function resposta(texto, finishReason = 'stop') {
    return { ok: true, json: async () => ({ choices: [{ message: { content: texto }, finish_reason: finishReason }] }) };
}

test('gera JSON independente no OpenRouter, preservando modelo e sem contexto antigo', async (t) => {
    let pedido;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        pedido = JSON.parse(options.body);
        return resposta(JSON.stringify(fixture()));
    });
    const api = servico();
    api.chatHistory.push({ role: 'user', parts: [{ text: 'Conversa antiga' }] });
    const mundo = await api.gerarMundo('Cidades flutuantes');
    assert.deepEqual(mundo, fixture());
    assert.equal(pedido.model, 'modelo:free');
    assert.equal(pedido.messages.length, 2);
    assert.match(pedido.messages[1].content, /Cidades flutuantes/);
    assert.deepEqual(pedido.response_format, { type: 'json_object' });
    assert.equal(pedido.max_tokens, 3000);
    assert.equal(api.getTamanhoHistorico(), 1);
});

test('cada geracao envia somente seu proprio tema', async (t) => {
    const pedidos = [];
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        pedidos.push(JSON.parse(options.body));
        return resposta(JSON.stringify(fixture()));
    });
    const api = servico();
    await api.gerarMundo('Oceano de lava');
    await api.gerarMundo('Planeta de gelo');
    assert.equal(api.getTamanhoHistorico(), 0);
    assert.doesNotMatch(pedidos[1].messages[1].content, /Oceano de lava/);
});

test('respeita limite configuravel e desativa raciocinio opcional do Flash 2.5', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        const pedido = JSON.parse(options.body);
        assert.equal(pedido.max_tokens, 4000);
        assert.deepEqual(pedido.reasoning, { enabled: false });
        return resposta(JSON.stringify(fixture()));
    });
    const api = new GeminiService({ openrouterKey: 'teste', model: 'google/gemini-2.5-flash', worldMaxTokens: 4000 });
    await api.gerarMundo('Fantasia');
    assert.throws(() => new GeminiService({ openrouterKey: 'teste', worldMaxTokens: NaN }), /inteiro positivo/);
});

test('aceita JSON cercado por bloco Markdown', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => resposta('```json\n' + JSON.stringify(fixture()) + '\n```'));
    assert.deepEqual(await servico().gerarMundo('Fantasia'), fixture());
});

test('corrige colchete ausente em recompensas sem outra chamada a API', async (t) => {
    const invalido = JSON.stringify(fixture()).replace('"recompensas":["Recompensa sugerida"]', '"recompensas":["Recompensa sugerida"');
    assert.throws(() => JSON.parse(invalido));
    const fetch = t.mock.method(globalThis, 'fetch', async () => resposta(invalido));
    assert.deepEqual(await servico().gerarMundo('Fantasia'), fixture());
    assert.equal(fetch.mock.callCount(), 1);
});

test('rejeita tema vazio antes de chamar a API', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch');
    await assert.rejects(servico().gerarMundo('   '), /Informe um tema/);
    assert.equal(fetch.mock.callCount(), 0);
});

test('rejeita JSON invalido e objeto com colecoes ausentes', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => resposta('{"mundo":'));
    await assert.rejects(servico().gerarMundo('Fantasia'), /JSON completo e valido/);
    fetch.mock.mockImplementation(async () => resposta('{"versao":"1.0"}'));
    await assert.rejects(servico().gerarMundo('Fantasia'), /deve ser um objeto/);
});

test('rejeita resposta truncada sem repetir uma geracao paga', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        json: async () => ({
            choices: [{ message: { content: '{"versao":"1.0","mundo":' }, finish_reason: 'length' }],
            usage: { completion_tokens: 3000, completion_tokens_details: { reasoning_tokens: 0 } },
        }),
    }));
    await assert.rejects(servico().gerarMundo('Fantasia'), (error) => {
        assert.equal(error.code, 'MUNDO_TRUNCADO');
        assert.match(error.message, /limite de tokens/);
        assert.match(error.message, /3000/);
        assert.equal(error.diagnostico.motivo_termino, 'length');
        assert.equal(error.diagnostico.tokens_resposta, 3000);
        assert.equal(error.diagnostico.resposta_parcial, '{"versao":"1.0","mundo":');
        assert.doesNotMatch(JSON.stringify(error.diagnostico), /chave-de-teste/);
        return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
});

test('resposta vazia tem mensagem propria e nao e confundida com limite de tokens', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => resposta('   ', 'stop'));
    await assert.rejects(servico().gerarMundo('Fantasia'), (error) => {
        assert.equal(error.code, 'MUNDO_VAZIO');
        assert.match(error.message, /resposta vazia/);
        assert.doesNotMatch(error.message, /interrompeu/);
        assert.equal(error.diagnostico.motivo_termino, 'stop');
        return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
});

test('429 gera erro, nunca um aviso salvo como se fosse o mundo', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await assert.rejects(servico().gerarMundo('Fantasia', 1), /Erro 429/);
});

test('401 encerra sem repetir com uma chave invalida', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await assert.rejects(servico().gerarMundo('Fantasia'), /Erro 401/);
    assert.equal(fetch.mock.callCount(), 1);
});

test('402 explica o limite de saldo sem repetir a chamada', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => ({
        ok: false, status: 402,
        json: async () => ({ error: { message: 'You requested up to 4500 tokens, but can only afford 3806.' } }),
    }));
    const api = new GeminiService({ openrouterKey: 'teste', worldMaxTokens: 4500 });
    await assert.rejects(api.gerarMundo('Fantasia'), (error) => {
        assert.equal(error.status, 402);
        assert.match(error.message, /Saldo insuficiente/);
        assert.match(error.message, /4500/);
        assert.match(error.message, /3806/);
        assert.match(error.message, /WORLD_MAX_TOKENS/);
        return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
});

test('configuracao do terminal usa 3000 por padrao e respeita ajuste explicito', (t) => {
    const anterior = process.env;
    process.env = { OPENROUTER_API_KEY: 'teste' };
    t.after(() => { process.env = anterior; });
    assert.equal(obterConfig().worldMaxTokens, 3000);
    process.env.WORLD_MAX_TOKENS = '3500';
    assert.equal(obterConfig().worldMaxTokens, 3500);
});

test('valida IDs, referencias, atributos inteiros e racas opcionais', () => {
    const mundo = fixture();
    mundo.racas = [];
    assert.equal(validarMundo(mundo), mundo);
    mundo.classes[0].bonus_atributos.forca = 1.5;
    assert.throws(() => validarMundo(mundo), /numero inteiro/);
    mundo.classes[0].bonus_atributos.forca = 2;
    mundo.classes[0].itens_iniciais_ids = ['item_inexistente'];
    assert.throws(() => validarMundo(mundo), /Referencia inexistente/);
    mundo.classes[0].itens_iniciais_ids = ['item_1'];
    mundo.ambientes.push(structuredClone(mundo.ambientes[0]));
    assert.throws(() => validarMundo(mundo), /IDs duplicados/);
});

test('gera JSON no caminho Google direto e detecta truncamento', async (t) => {
    const api = new GeminiService({ geminiKey: 'chave-de-teste', model: 'modelo-teste' });
    const gerar = t.mock.method(api.ai.models, 'generateContent', async (pedido) => {
        assert.equal(pedido.config.responseMimeType, 'application/json');
        assert.equal(pedido.contents.length, 1);
        return { text: JSON.stringify(fixture()) };
    });
    assert.deepEqual(await api.gerarMundo('Fantasia'), fixture());
    assert.equal(api.getTamanhoHistorico(), 0);
    gerar.mock.mockImplementation(async () => ({ text: '{', candidates: [{ finishReason: 'MAX_TOKENS' }] }));
    await assert.rejects(api.gerarMundo('Fantasia'), /limite de tokens/);
});

test('mantem o metodo de conversa disponivel para uso futuro', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => resposta('Ola, aventureiro!'));
    const api = servico();
    assert.equal(await api.enviarMensagem('Ola'), 'Ola, aventureiro!');
    assert.equal(api.getTamanhoHistorico(), 2);
});

test('terminal salva e imprime o mesmo JSON inteiro com nome unico', async (t) => {
    const argvAnterior = process.argv;
    const envAnterior = process.env;
    process.argv = ['node', 'chat-terminal.js', 'Fantasia', 'sombria'];
    process.env = { ...process.env, OPENROUTER_API_KEY: 'teste', GEMINI_MODEL: 'modelo' };
    t.after(() => { process.argv = argvAnterior; process.env = envAnterior; });
    t.mock.method(GeminiService.prototype, 'gerarMundo', async (tema) => {
        assert.equal(tema, 'Fantasia sombria');
        return fixture();
    });
    t.mock.method(fs, 'mkdir', async () => {});
    const salvar = t.mock.method(fs, 'writeFile', async () => {});
    const imprimir = t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    await main();
    const [arquivo, json, opcoes] = salvar.mock.calls[0].arguments;
    assert.match(arquivo, /output[\\/]mundos[\\/]mundo-.*\.json$/);
    assert.deepEqual(JSON.parse(json), fixture());
    assert.equal(opcoes.flag, 'wx');
    assert.equal(imprimir.mock.calls[0].arguments[0], json);
});

test('terminal salva somente diagnostico quando a API corta a resposta', async (t) => {
    const argvAnterior = process.argv;
    const envAnterior = process.env;
    process.argv = ['node', 'chat-terminal.js', 'Fantasia nordica'];
    process.env = { ...process.env, OPENROUTER_API_KEY: 'teste', WORLD_MAX_TOKENS: '3000' };
    t.after(() => { process.argv = argvAnterior; process.env = envAnterior; });
    const fetch = t.mock.method(globalThis, 'fetch', async () => resposta('{', 'length'));
    t.mock.method(fs, 'mkdir', async () => {});
    const salvar = t.mock.method(fs, 'writeFile', async () => {});
    const imprimir = t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    await assert.rejects(main(), { code: 'MUNDO_TRUNCADO' });
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(salvar.mock.callCount(), 1);
    const [arquivo, json] = salvar.mock.calls[0].arguments;
    assert.match(arquivo, /output[\\/]diagnosticos[\\/]/);
    assert.equal(JSON.parse(json).resposta_parcial, '{');
    assert.equal(imprimir.mock.callCount(), 0);
});

test('configuracao rejeita placeholders', (t) => {
    const anterior = process.env;
    process.env = { OPENROUTER_API_KEY: 'sua_chave_openrouter_aqui', GEMINI_API_KEY: 'sua_chave_gemini_aqui' };
    t.after(() => { process.env = anterior; });
    assert.throws(obterConfig, /Configure OPENROUTER_API_KEY/);
});
