// Geracao direta de mundo: tema -> IA -> um unico arquivo JSON.
// npm run mundo -- "Cyberpunk com folclore mineiro"
// Sem argumento, pergunta o tema uma vez no terminal.
const readline = require('node:readline/promises');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const GeminiService = require('./services/geminiService');

function obterConfig() {
    const chaveValida = (chave) => chave && chave.trim() && !/^sua_chave/i.test(chave.trim());
    const config = {
        model: process.env.GEMINI_MODEL,
        worldMaxTokens: Number(process.env.WORLD_MAX_TOKENS || 3000),
    };
    if (chaveValida(process.env.OPENROUTER_API_KEY)) {
        return { ...config, openrouterKey: process.env.OPENROUTER_API_KEY };
    }
    if (chaveValida(process.env.GEMINI_API_KEY)) {
        return { ...config, geminiKey: process.env.GEMINI_API_KEY };
    }
    throw new Error('Configure OPENROUTER_API_KEY ou GEMINI_API_KEY no arquivo .env.');
}

async function main() {
    require('dotenv').config({ quiet: true });
    const servico = new GeminiService(obterConfig());
    let tema = process.argv.slice(2).join(' ').trim();

    if (!tema) {
        const terminal = readline.createInterface({ input: process.stdin, output: process.stderr });
        try {
            tema = (await terminal.question('Tema e detalhes do mundo: ')).trim();
        } finally {
            terminal.close();
        }
    }
    if (!tema) throw new Error('O tema nao pode ficar vazio.');

    console.error(`\nGerando mundo com ${servico.getProvedor()}...`);
    let mundo;
    try {
        mundo = await servico.gerarMundo(tema);
    } catch (error) {
        if (error.diagnostico) {
            const pasta = path.resolve(__dirname, '..', 'output', 'diagnosticos');
            const arquivo = path.join(pasta, `mundo-${randomUUID()}.json`);
            try {
                await fs.mkdir(pasta, { recursive: true });
                await fs.writeFile(arquivo, `${JSON.stringify(error.diagnostico, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
                console.error(`Diagnostico da resposta salvo em: ${arquivo}`);
            } catch (falhaArquivo) {
                console.error(`Nao foi possivel salvar o diagnostico: ${falhaArquivo.message}`);
            }
        }
        throw error;
    }
    const json = `${JSON.stringify(mundo, null, 2)}\n`;
    const pasta = path.resolve(__dirname, '..', 'output', 'mundos');
    const data = new Date().toISOString().replace(/[:.]/g, '-');
    const arquivo = path.join(pasta, `mundo-${data}-${randomUUID().slice(0, 8)}.json`);
    await fs.mkdir(pasta, { recursive: true });
    await fs.writeFile(arquivo, json, { encoding: 'utf8', flag: 'wx' });

    console.log(json);
    console.error(`Mundo salvo em: ${arquivo}`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Erro: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { main, obterConfig };
