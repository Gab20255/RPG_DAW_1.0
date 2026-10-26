// ============================================
// Serviço de Integração com Google Gemini
// ============================================
// Suporta dois provedores:
//   1. Google AI Studio (direto) — GEMINI_API_KEY
//   2. OpenRouter (proxy) — OPENROUTER_API_KEY
//
// O OpenRouter usa formato OpenAI-compatível e tem modelos gratuitos.

const SYSTEM_PROMPT = `Você é o MESTRE DE RPG definitivo — um narrador épico, criativo e imersivo.

SUAS RESPONSABILIDADES:
1. **Criação de Mundo**: Quando o jogador definir um tema/cenário, você cria um universo rico com lore, história, facções e conflitos.
2. **Classes e Atributos**: Apresente 4 a 6 classes únicas adaptadas ao tema, cada uma com:
   - Nome da classe
   - Descrição temática (2-3 frases)
   - Bônus de atributos (Força, Destreza, Inteligência, Carisma, Constituição, Sabedoria)
   - Habilidade especial única
3. **Criação de Personagem**: Guie o jogador na criação interativa do personagem (nome, classe, aparência).
4. **Narração**: Descreva cenários com detalhes sensoriais (visão, som, cheiro). Seja cinematográfico.
5. **NPCs**: Interprete NPCs com personalidade, sotaque e motivações próprias. Use aspas para falas.
6. **Combate e Desafios**: Quando houver ação, descreva o que acontece e peça rolagem de dados (D20).
7. **Progressão**: Mantenha a história avançando. Dê opções claras ao jogador no final de cada narração.

REGRAS:
- Nunca quebre a imersão. Você É o mestre, não uma IA.
- Respostas em português brasileiro.
- Use formatação com **negrito** para nomes importantes e *itálico* para descrições ambientais.
- No final de cada resposta, dê 2-3 opções de ação para o jogador.
- Se o jogador ainda não escolheu um tema, comece perguntando qual universo/cenário ele quer jogar.
- Mantenha respostas envolventes mas não excessivamente longas (máximo ~300 palavras por turno).`;

class GeminiService {
    constructor(config) {
        this.chatHistory = [];

        // Detecta qual provedor usar
        if (config.openrouterKey) {
            this.provider = 'openrouter';
            this.apiKey = config.openrouterKey;
            let m = config.model || 'google/gemini-2.5-flash';
            if (m.endsWith(':free')) {
                m = 'google/gemini-2.5-flash';
            }
            this.modelName = m;
            this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        } else if (config.geminiKey) {
            this.provider = 'gemini';
            const { GoogleGenAI } = require('@google/genai');
            this.ai = new GoogleGenAI({ apiKey: config.geminiKey });
            this.modelName = config.model || 'gemini-3.8-flash';
        } else {
            throw new Error('Nenhuma chave de API configurada! Configure OPENROUTER_API_KEY ou GEMINI_API_KEY no .env');
        }
    }

    /**
     * Envia mensagem — roteia para o provedor correto
     */
    async enviarMensagem(mensagemUsuario, tentativas = 3) {
        if (this.provider === 'openrouter') {
            return this._enviarOpenRouter(mensagemUsuario, tentativas);
        }
        return this._enviarGemini(mensagemUsuario, tentativas);
    }

    /**
     * Envia via OpenRouter (formato OpenAI-compatível)
     */
    async _enviarOpenRouter(mensagemUsuario, tentativas) {
        // Monta mensagens no formato OpenAI
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT }
        ];

        // Histórico
        for (const msg of this.chatHistory) {
            messages.push({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts[0].text
            });
        }

        // Mensagem atual
        messages.push({ role: 'user', content: mensagemUsuario });

        for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
            try {
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'http://localhost:3000',
                        'X-Title': 'RPG Multiplayer Gemini'
                    },
                    body: JSON.stringify({
                        model: this.modelName,
                        messages: messages,
                        temperature: 0.9,
                        top_p: 0.95,
                        max_tokens: 1200,
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const status = response.status;
                    const ehTemporario = status === 503 || status === 429 || status === 502;

                    if (ehTemporario && tentativa < tentativas) {
                        const espera = tentativa * 3;
                        process.stdout.write(`\x1b[33m⏳ API ocupada (${status}). Tentando novamente em ${espera}s... (${tentativa}/${tentativas})\x1b[0m\n`);
                        await new Promise(r => setTimeout(r, espera * 1000));
                        continue;
                    }

                    if (ehTemporario) {
                        return `⚠️  A API está sobrecarregada (erro ${status}). Aguarde ~30 segundos e tente novamente.`;
                    }

                    throw new Error(`Erro ${status}: ${JSON.stringify(errorData)}`);
                }

                const data = await response.json();
                const respostaTexto = data.choices?.[0]?.message?.content || 'Mestre não conseguiu responder...';

                // Salva no histórico
                this.chatHistory.push({
                    role: 'user',
                    parts: [{ text: mensagemUsuario }]
                });
                this.chatHistory.push({
                    role: 'model',
                    parts: [{ text: respostaTexto }]
                });

                return respostaTexto;

            } catch (error) {
                if (tentativa < tentativas) {
                    const espera = tentativa * 2;
                    process.stdout.write(`\x1b[33m⏳ Tentando reconectar em ${espera}s... (${tentativa}/${tentativas})\x1b[0m\n`);
                    await new Promise(r => setTimeout(r, espera * 1000));
                    continue;
                }
                throw error;
            }
        }
    }

    /**
     * Envia via Google AI Studio (direto)
     */
    async _enviarGemini(mensagemUsuario, tentativas) {
        const contents = [];

        for (const msg of this.chatHistory) {
            contents.push(msg);
        }

        contents.push({
            role: 'user',
            parts: [{ text: mensagemUsuario }]
        });

        for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
            try {
                const response = await this.ai.models.generateContent({
                    model: this.modelName,
                    contents: contents,
                    config: {
                        systemInstruction: SYSTEM_PROMPT,
                        temperature: 0.9,
                        topP: 0.95,
                        maxOutputTokens: 2048,
                    }
                });

                const respostaTexto = response.text;

                this.chatHistory.push({
                    role: 'user',
                    parts: [{ text: mensagemUsuario }]
                });
                this.chatHistory.push({
                    role: 'model',
                    parts: [{ text: respostaTexto }]
                });

                return respostaTexto;

            } catch (error) {
                const status = error.status || error?.error?.code;
                const ehTemporario = status === 503 || status === 429;

                if (ehTemporario && tentativa < tentativas) {
                    const espera = tentativa * 3;
                    process.stdout.write(`\x1b[33m⏳ API ocupada (${status}). Tentando novamente em ${espera}s... (${tentativa}/${tentativas})\x1b[0m\n`);
                    await new Promise(r => setTimeout(r, espera * 1000));
                    continue;
                }

                if (ehTemporario) {
                    return `⚠️  A API do Gemini está sobrecarregada (erro ${status}). Aguarde ~30 segundos e tente novamente.`;
                }

                throw error;
            }
        }
    }

    /**
     * Limpa o histórico da conversa (novo jogo)
     */
    resetar() {
        this.chatHistory = [];
    }

    /**
     * Retorna o número de mensagens no histórico
     */
    getTamanhoHistorico() {
        return this.chatHistory.length;
    }

    /**
     * Retorna qual provedor está sendo usado
     */
    getProvedor() {
        return `${this.provider} (${this.modelName})`;
    }
}

module.exports = GeminiService;
