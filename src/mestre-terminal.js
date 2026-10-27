const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { criarTerminal, escolher } = require('./terminal/io');
const { RAIZ, lerJson, listarJson, salvarNovo, salvarAtomico } = require('./terminal/arquivos');
const { validarMundo } = require('./prompts/mundoPrompt');
const { MESTRE_PROMPT } = require('./prompts/mestrePrompt');
const { criarPartida, registrarAcao, montarContexto, narrarPendente } = require('./services/partidaService');
const { resumoHabilidade } = require('./personagem-terminal');
const GeminiService = require('./services/geminiService');
const { obterConfig } = require('./chat-terminal');

function ajuda(terminal) {
    terminal.escrever('\nCOMANDOS\n  /ficha — consultar a ficha\n  /habilidades — poderes e limites mecânicos\n  /locais — conexões disponíveis\n  /observar — pedir descrição do local atual\n  /falar <fala> — conversar com os NPCs presentes\n  /teste <atributo> <ação> — teste D20 local (dificuldade de protótipo: 12)\n  /ir <número> — transição validada para um local conectado\n  /contexto — exportar o contexto da IA, sem chamada de API\n  /repetir — repetir a última narração sem recalcular o resultado\n  /sair — encerrar\nAções em texto livre ficam como intenções; efeitos sem regra implementada não são aplicados.');
}

async function exportarContexto(estado, mundo, terminal, pasta = path.join(RAIZ, 'output/contextos')) {
    const base = estado.eventos.length ? estado : registrarAcao(estado, mundo, '/observar');
    const dados = { instrucao_sistema: MESTRE_PROMPT, contexto: montarContexto(base, mundo) };
    const arquivo = await salvarNovo(pasta, 'contexto', dados);
    terminal.escrever(`Contexto salvo sem consultar a IA: ${arquivo}`);
    return arquivo;
}

async function main({ args = process.argv.slice(2), terminal = criarTerminal(), pastaPersonagens = path.join(RAIZ, 'output/personagens'), pastaPartidas = path.join(RAIZ, 'output/partidas'), pastaContextos, criarServico = () => new GeminiService(obterConfig()) } = {}) {
    require('dotenv').config({ quiet: true });
    try {
        const contextoSomente = args.includes('--contexto');
        const argumento = args.find((item) => item !== '--contexto');
        let ficha;
        if (argumento) ficha = await lerJson(path.resolve(argumento));
        else {
            const arquivos = await listarJson(pastaPersonagens, (dados) => { if (!dados.id || !dados.mundo_arquivo) throw new Error('Não é uma ficha.'); });
            if (!arquivos.length) throw new Error('Crie uma ficha primeiro com npm run personagem.');
            ficha = await escolher(terminal, 'ESCOLHA SEU PERSONAGEM', arquivos.map((item) => ({ valor: item.dados, rotulo: `${item.dados.nome} — ${item.dados.classe} — ${item.dados.mundo_nome}` })));
        }
        if (typeof ficha.mundo_arquivo !== 'string') throw new Error('A ficha não informa o arquivo do mundo. Recrie-a pelo terminal.');
        const mundo = validarMundo(await lerJson(path.resolve(RAIZ, ficha.mundo_arquivo)));
        const inicial = criarPartida(ficha, mundo);
        const arquivoPartida = path.join(pastaPartidas, `partida-${inicial.personagem.id}.json`);
        let estado = inicial;
        try {
            const salvo = await lerJson(arquivoPartida);
            if (salvo.versao !== inicial.versao || salvo.mundo_hash !== inicial.mundo_hash || !isDeepStrictEqual(salvo.personagem, inicial.personagem) || !Array.isArray(salvo.eventos) || !mundo.ambientes.some((a) => a.id === salvo.ambiente_id)) throw new Error('A partida salva é incompatível com a ficha ou o mundo.');
            estado = salvo;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (contextoSomente) return await exportarContexto(estado, mundo, terminal, pastaContextos);

        terminal.escrever(`\n${ficha.nome} — ${mundo.mundo.nome}\nOs resultados são registrados localmente antes da narração. O Mestre consulta a API apenas ao narrar uma ação ou resultado ainda sem narração.`);
        ajuda(terminal);
        let servico;
        while (true) {
            const entrada = await terminal.perguntar('\nAção ou comando: ');
            if (!entrada) continue;
            if (entrada === '/ajuda') { ajuda(terminal); continue; }
            if (entrada === '/ficha') { terminal.escrever(JSON.stringify(estado.personagem, null, 2)); continue; }
            if (entrada === '/habilidades') { estado.personagem.habilidades.forEach((h) => terminal.escrever(`${resumoHabilidade(h)}\nLimitação: ${h.limitacao}\nContrajogo: ${h.contrajogo.join(', ')}`)); continue; }
            if (entrada === '/locais') {
                const atual = mundo.ambientes.find((a) => a.id === estado.ambiente_id);
                terminal.escrever(`Local atual: ${atual.nome}`);
                atual.conexoes_ids.forEach((id, i) => terminal.escrever(`${i + 1}. ${mundo.ambientes.find((a) => a.id === id).nome}`));
                if (!atual.conexoes_ids.length) terminal.escrever('Nenhuma conexão conhecida.');
                continue;
            }
            if (entrada === '/contexto') { await exportarContexto(estado, mundo, terminal, pastaContextos); continue; }
            try {
                if (entrada !== '/repetir') {
                    const novoEstado = registrarAcao(estado, mundo, entrada);
                    await salvarAtomico(arquivoPartida, novoEstado);
                    estado = novoEstado;
                }
                const evento = estado.eventos.at(-1);
                if (!evento) throw new Error('Nenhum resultado anterior para narrar.');
                terminal.escrever(`\nRESULTADO OFICIAL: ${evento.resumo}`);
                if (!evento.narracao) servico ||= criarServico();
                const narrado = await narrarPendente(estado, mundo, servico);
                await salvarAtomico(arquivoPartida, narrado);
                estado = narrado;
                terminal.escrever(`\nMESTRE: ${estado.eventos.at(-1).narracao.narracao}`);
                estado.eventos.at(-1).narracao.propostas.forEach((p) => terminal.escrever(`PROPOSTA PENDENTE (${p.tipo}): ${p.descricao}`));
            } catch (error) { terminal.escrever(`Erro: ${error.message}\nO último estado salvo foi preservado. Use /repetir para narrar o mesmo resultado.`); }
        }
    } finally { terminal.fechar(); }
}

if (require.main === module) main().catch((error) => { console.error(error.code === 'CANCELADO' ? 'Sessão encerrada.' : error.message); if (error.code !== 'CANCELADO') process.exitCode = 1; });
module.exports = { main, exportarContexto };
