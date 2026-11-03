const fs = require('node:fs');
const caminhos = require('node:path');
const { parse: interpretarEnv } = require('dotenv');
const { RAIZ } = require('../terminal/arquivos');

function obterConfiguracao(raiz = RAIZ) {
    const arquivo = caminhos.join(raiz, '.env');
    let local;
    try { local = interpretarEnv(fs.readFileSync(arquivo)); }
    catch (erro) {
        if (erro.code === 'ENOENT') throw new Error(`Configuração local ausente: ${arquivo}`);
        throw erro;
    }
    const chaveValida = chave => typeof chave === 'string' && chave.trim() && !/^sua_chave/i.test(chave.trim());
    const openrouterKey = chaveValida(local.OPENROUTER_API_KEY) ? local.OPENROUTER_API_KEY.trim() : undefined;
    const geminiKey = chaveValida(local.GEMINI_API_KEY) ? local.GEMINI_API_KEY.trim() : undefined;
    if (!openrouterKey && !geminiKey) throw new Error(`Chave de API ausente no arquivo ${arquivo}`);
    const valores = { ...process.env, ...local };
    return {
        openrouterKey, geminiKey,
        model: valores.GEMINI_MODEL || (openrouterKey ? 'deepseek/deepseek-v4-flash' : 'gemini-2.5-flash-lite'),
        worldMaxTokens: Number(valores.WORLD_MAX_TOKENS || 10000),
        limiteAgente: Number(valores.AGENT_MAX_TOKENS || valores.WORLD_MAX_TOKENS || 10000),
        limiteRevisao: Number(valores.REVIEW_MAX_TOKENS || valores.AGENT_MAX_TOKENS || valores.WORLD_MAX_TOKENS || 10000),
        concorrencia: Number(valores.GENERATION_CONCURRENCY || 6),
        narrationMaxTokens: Number(valores.NARRATION_MAX_TOKENS || 1600),
        limiteMestre: Number(valores.MASTER_MAX_TOKENS || 2400),
        limiteAprofundamento: Number(valores.ENRICHMENT_MAX_TOKENS || valores.WORLD_MAX_TOKENS || 10000),
    };
}

module.exports = { obterConfiguracao };
