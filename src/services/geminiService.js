// ============================================
// Serviço de Integração com Google Gemini
// ============================================
// Suporta dois provedores:
//   1. Google AI Studio (direto) — GEMINI_API_KEY
//   2. OpenRouter (proxy) — OPENROUTER_API_KEY
//
// O OpenRouter usa formato OpenAI-compatível e tem modelos gratuitos.

const { criarMundoPrompt, validarMundo } = require('../prompts/mundoPrompt');
const { jsonrepair } = require('jsonrepair');

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
        this.worldMaxTokens = config.worldMaxTokens ?? 3000;
        if (!Number.isInteger(this.worldMaxTokens) || this.worldMaxTokens <= 0) {
            throw new Error('WORLD_MAX_TOKENS deve ser um numero inteiro positivo.');
        }

        // Detecta qual provedor usar
        if (config.openrouterKey) {
            this.provider = 'openrouter';
            this.apiKey = config.openrouterKey;
            this.modelName = config.model || 'google/gemini-2.5-flash';
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

    /** Gera um mundo independente, sem conversa nem criacao de jogador. */
    async gerarMundo(tema, tentativas = 3) {
        if (typeof tema !== 'string' || !tema.trim()) {
            throw new Error('Informe um tema para gerar o mundo.');
        }

        const opcoes = { systemPrompt: criarMundoPrompt(this.worldMaxTokens), json: true, maxTokens: this.worldMaxTokens, usarHistorico: false };
        const pedido = `Crie o mundo completo para esta descricao: ${JSON.stringify(tema.trim())}`;
        const texto = this.provider === 'openrouter'
            ? await this._enviarOpenRouter(pedido, tentativas, opcoes)
            : await this._enviarGemini(pedido, tentativas, opcoes);

        let mundo;
        try {
            const json = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            // Nunca completa uma resposta cortada; so corrige sintaxe de um objeto encerrado.
            if (!json.startsWith('{') || !json.endsWith('}')) throw new Error('Objeto incompleto.');
            try {
                mundo = JSON.parse(json);
            } catch {
                mundo = JSON.parse(jsonrepair(json));
            }
        } catch {
            throw new Error('A IA nao retornou um JSON completo e valido. Nenhum arquivo foi salvo. Tente novamente.');
        }
        return validarMundo(mundo);
    }

    /**
     * Envia via OpenRouter (formato OpenAI-compatível)
     */
    async _enviarOpenRouter(mensagemUsuario, tentativas, opcoes = {}) {
        // Monta mensagens no formato OpenAI
        const messages = [
            { role: 'system', content: opcoes.systemPrompt || SYSTEM_PROMPT }
        ];

        // Histórico
        for (const msg of opcoes.usarHistorico === false ? [] : this.chatHistory) {
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
                    signal: AbortSignal.timeout(180000),
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'http://localhost:3000',
                        'X-Title': 'RPG Multiplayer Gemini'
                    },
                    body: JSON.stringify({
                        model: this.modelName,
                        messages: messages,
                        temperature: opcoes.json ? 0.4 : 0.9,
                        top_p: 0.95,
                        max_tokens: opcoes.maxTokens || 1200,
                        ...(opcoes.json ? { response_format: { type: 'json_object' } } : {}),
                        // No Flash 2.5, reserva o orcamento para o JSON em vez de raciocinio.
                        ...(opcoes.json && /^google\/gemini-2\.5-flash(?::free)?$/.test(this.modelName)
                            ? { reasoning: { enabled: false } } : {}),
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const status = response.status;
                    const ehTemporario = status === 503 || status === 429 || status === 502;

                    if (status === 402) {
                        const disponiveis = errorData.error?.message?.match(/can only afford\s+(\d+)/i)?.[1];
                        const detalhe = disponiveis ? ` O saldo atual permite ate ${disponiveis} tokens de resposta.` : '';
                        const error = new Error(`Saldo insuficiente no OpenRouter para solicitar ${opcoes.maxTokens || 1200} tokens.${detalhe} Reduza WORLD_MAX_TOKENS no .env ou adicione creditos na sua conta.`);
                        error.status = status;
                        throw error;
                    }

                    if (ehTemporario && tentativa < tentativas) {
                        const espera = tentativa * 3;
                        process.stderr.write(`\x1b[33m⏳ API ocupada (${status}). Tentando novamente em ${espera}s... (${tentativa}/${tentativas})\x1b[0m\n`);
                        await new Promise(r => setTimeout(r, espera * 1000));
                        continue;
                    }

                    if (ehTemporario && !opcoes.json) {
                        return `⚠️  A API está sobrecarregada (erro ${status}). Aguarde ~30 segundos e tente novamente.`;
                    }

                    const error = new Error(`Erro ${status}: ${errorData.error?.message || 'Falha na API OpenRouter.'}`);
                    error.status = status;
                    throw error;
                }

                const data = await response.json();
                if (opcoes.json) {
                    const choice = data.choices?.[0];
                    this._validarRespostaMundo({
                        texto: choice?.message?.content,
                        motivo: choice?.finish_reason || choice?.native_finish_reason || 'nao informado',
                        cortada: choice?.finish_reason === 'length' || choice?.native_finish_reason === 'MAX_TOKENS',
                        tokens: data.usage?.completion_tokens,
                        tokensRaciocinio: data.usage?.completion_tokens_details?.reasoning_tokens,
                        limite: opcoes.maxTokens,
                    });
                }
                const respostaTexto = data.choices?.[0]?.message?.content || 'Mestre não conseguiu responder...';

                // Salva no histórico
                if (opcoes.usarHistorico !== false) {
                    this.chatHistory.push({ role: 'user', parts: [{ text: mensagemUsuario }] });
                    this.chatHistory.push({ role: 'model', parts: [{ text: respostaTexto }] });
                }

                return respostaTexto;

            } catch (error) {
                if (tentativa < tentativas && (!error.status || [429, 502, 503].includes(error.status))) {
                    const espera = tentativa * 2;
                    process.stderr.write(`\x1b[33m⏳ Tentando reconectar em ${espera}s... (${tentativa}/${tentativas})\x1b[0m\n`);
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
    async _enviarGemini(mensagemUsuario, tentativas, opcoes = {}) {
        const contents = [];

        for (const msg of opcoes.usarHistorico === false ? [] : this.chatHistory) {
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
                        systemInstruction: opcoes.systemPrompt || SYSTEM_PROMPT,
                        temperature: opcoes.json ? 0.4 : 0.9,
                        topP: 0.95,
                        maxOutputTokens: opcoes.maxTokens || 2048,
                        ...(opcoes.json ? { responseMimeType: 'application/json' } : {}),
                    }
                });

                if (opcoes.json) {
                    this._validarRespostaMundo({
                        texto: response.text,
                        motivo: response.candidates?.[0]?.finishReason || 'nao informado',
                        cortada: response.candidates?.[0]?.finishReason === 'MAX_TOKENS',
                        tokens: response.usageMetadata?.candidatesTokenCount,
                        tokensRaciocinio: response.usageMetadata?.thoughtsTokenCount,
                        limite: opcoes.maxTokens,
                    });
                }
                const respostaTexto = response.text;

                if (opcoes.usarHistorico !== false) {
                    this.chatHistory.push({ role: 'user', parts: [{ text: mensagemUsuario }] });
                    this.chatHistory.push({ role: 'model', parts: [{ text: respostaTexto }] });
                }

                return respostaTexto;

            } catch (error) {
                const status = error.status || error?.error?.code;
                const ehTemporario = status === 503 || status === 429;

                if (ehTemporario && tentativa < tentativas) {
                    const espera = tentativa * 3;
                    process.stderr.write(`\x1b[33m⏳ API ocupada (${status}). Tentando novamente em ${espera}s... (${tentativa}/${tentativas})\x1b[0m\n`);
                    await new Promise(r => setTimeout(r, espera * 1000));
                    continue;
                }

                if (ehTemporario && !opcoes.json) {
                    return `⚠️  A API do Gemini está sobrecarregada (erro ${status}). Aguarde ~30 segundos e tente novamente.`;
                }

                throw error;
            }
        }
    }

    _validarRespostaMundo({ texto, motivo, cortada, tokens, tokensRaciocinio, limite }) {
        const vazia = typeof texto !== 'string' || !texto.trim();
        if (!cortada && !vazia) return;

        const detalhe = `Motivo: ${motivo}; tokens de resposta informados: ${tokens ?? 'nao informados'}; limite solicitado: ${limite}.`;
        const error = new Error(cortada
            ? `A API interrompeu a geracao no limite de tokens, antes de concluir o mundo. ${detalhe} Nenhum mundo foi salvo.`
            : `A API retornou uma resposta vazia para o mundo. ${detalhe} Nenhum mundo foi salvo.`);
        error.status = 422;
        error.code = cortada ? 'MUNDO_TRUNCADO' : 'MUNDO_VAZIO';
        // Somente conteudo gerado e metadados; nunca inclui chave ou cabecalhos da requisicao.
        error.diagnostico = {
            provedor: this.provider,
            modelo: this.modelName,
            motivo_termino: motivo,
            limite_solicitado: limite,
            tokens_resposta: tokens ?? null,
            tokens_raciocinio: tokensRaciocinio ?? null,
            resposta_parcial: typeof texto === 'string' ? texto : '',
        };
        throw error;
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
