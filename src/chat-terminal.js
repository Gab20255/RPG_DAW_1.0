// ============================================
// Chat de Terminal — RPG com Gemini
// ============================================
// Prova de conceito: chat interativo no terminal
// onde o Gemini atua como Mestre do Jogo.
//
// Para rodar:
//   npm run chat
//
// Comandos especiais:
//   /sair      - Encerra o jogo
//   /novo      - Começa uma nova aventura
//   /historico - Mostra tamanho do histórico

require('dotenv').config();
const readline = require('readline');
const GeminiService = require('./services/geminiService');

// ── Cores para o terminal ───────────────────────
const CORES = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    white:   '\x1b[37m',
};

function cor(texto, cor_code) {
    return `${cor_code}${texto}${CORES.reset}`;
}

// ── Banner inicial ──────────────────────────────
function mostrarBanner() {
    console.log(cor(`                                         
     /sair      → Encerrar o jogo                     
     /novo      → Nova aventura                       
     /historico → Ver tamanho do contexto              

`, CORES.cyan));
}

// ── Validações ──────────────────────────────────
function validarConfig() {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const modelo = process.env.GEMINI_MODEL;

    // Prioriza OpenRouter se configurado e não placeholder
    if (openrouterKey && openrouterKey !== 'sua_chave_aqui') {
        return { openrouterKey, model: modelo };
    }

    if (geminiKey && geminiKey !== 'sua_chave_aqui') {
        return { geminiKey, model: modelo };
    }

    console.log(cor('\n❌ ERRO: Nenhuma chave de API configurada!', CORES.red));
    console.log(cor('\n   Opção 1 — OpenRouter (recomendado, modelos grátis disponíveis):', CORES.yellow));
    console.log(cor('     1. Crie sua conta em https://openrouter.ai', CORES.white));
    console.log(cor('     2. Pegue sua chave em https://openrouter.ai/keys', CORES.white));
    console.log(cor('     3. Adicione no .env: OPENROUTER_API_KEY=sk-or-v1-...', CORES.white));
    console.log(cor('\n   Opção 2 — Google AI Studio:', CORES.yellow));
    console.log(cor('     1. Crie chave em https://aistudio.google.com/apikey', CORES.white));
    console.log(cor('     2. Adicione no .env: GEMINI_API_KEY=sua_chave\n', CORES.white));
    process.exit(1);
}

// ── Loop principal do chat ──────────────────────
async function main() {
    mostrarBanner();

    const config = validarConfig();
    const gemini = new GeminiService(config);

    console.log(cor(`🔌 Provedor ativo: ${gemini.getProvedor()}`, CORES.dim));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const perguntar = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    // Mensagem inicial do Mestre
    console.log(cor('\n🎲 Conectando ao Mestre do Jogo...\n', CORES.yellow));

    try {
        const boasVindas = await gemini.enviarMensagem(
            'Olá Mestre! Estou pronto para jogar. Me apresente o RPG e pergunte qual tema/universo eu quero para minha aventura.'
        );
        console.log(cor('🧙 MESTRE:', CORES.magenta));
        console.log(boasVindas);
        console.log('');
    } catch (error) {
        console.log(cor(`\n❌ Erro ao conectar com o Gemini: ${error.message}`, CORES.red));
        console.log(cor('   Verifique sua chave da API no arquivo .env\n', CORES.yellow));
        rl.close();
        process.exit(1);
    }

    // Loop de conversa
    while (true) {
        const input = await perguntar(cor('⚔️  Você: ', CORES.green));
        const comando = input.trim().toLowerCase();

        // Comandos especiais
        if (comando === '/sair') {
            console.log(cor('\n👋 Até a próxima aventura, herói!\n', CORES.cyan));
            rl.close();
            process.exit(0);
        }

        if (comando === '/novo') {
            gemini.resetar();
            console.log(cor('\n🔄 Nova aventura iniciada! O histórico foi limpo.\n', CORES.yellow));
            const boasVindas = await gemini.enviarMensagem(
                'Olá Mestre! Quero começar uma nova aventura. Me pergunte qual tema/universo eu quero.'
            );
            console.log(cor('🧙 MESTRE:', CORES.magenta));
            console.log(boasVindas);
            console.log('');
            continue;
        }

        if (comando === '/historico') {
            const tamanho = gemini.getTamanhoHistorico();
            console.log(cor(`\n📜 Histórico: ${tamanho} mensagens na conversa.\n`, CORES.yellow));
            continue;
        }

        if (!input.trim()) continue;

        // Envia para o Gemini
        try {
            console.log(cor('\n⏳ O Mestre está narrando...\n', CORES.dim));
            const resposta = await gemini.enviarMensagem(input);
            console.log(cor('🧙 MESTRE:', CORES.magenta));
            console.log(resposta);
            console.log('');
        } catch (error) {
            console.log(cor(`\n❌ Erro: ${error.message}\n`, CORES.red));
        }
    }
}

// Executa
main();
