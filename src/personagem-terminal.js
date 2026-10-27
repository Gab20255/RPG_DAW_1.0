const path = require('node:path');
const { criarTerminal, escolher, perguntarTexto } = require('./terminal/io');
const { RAIZ, lerJson, hashMundo, listarJson, salvarNovo } = require('./terminal/arquivos');
const { validarMundo } = require('./prompts/mundoPrompt');
const { criarPersonagem, calcularAtributos } = require('./services/personagemService');
const { REGRAS, listarHabilidades, selecionarHabilidades } = require('./rules/habilidades');

function resumoHabilidade(h) {
    return `${h.nome} [${h.categoria}] | potência ${h.potencia} | energia ${h.custoRecurso} | alcance ${h.alcance} m | recarga ${h.recarga} turno(s) | duração ${h.duracao} turno(s)`;
}

async function escolherHabilidades(terminal) {
    const catalogo = listarHabilidades(1);
    terminal.escrever('\nHABILIDADES — escolha duas diferentes. Números calculados pelas regras do jogo:');
    catalogo.forEach((h, i) => {
        terminal.escrever(`\n  ${i + 1}. ${resumoHabilidade(h)}${h.disponivel ? '' : ` [BLOQUEADA: ${h.motivoBloqueio}]`}`);
        terminal.escrever(`     ${h.descricao} Alvo: ${h.alvo}. Limitação: ${h.limitacao}`);
        terminal.escrever(`     Contrajogo: ${h.contrajogo.join(', ')}. PP: ${h.orcamento.total}. Regras: ${h.versaoRegras}.`);
    });
    while (true) {
        const entrada = await terminal.perguntar('\nNúmeros separados por vírgula (ex.: 1,4): ');
        if (!/^\d+\s*,\s*\d+$/.test(entrada)) { terminal.escrever('Informe dois números separados por vírgula.'); continue; }
        const ids = entrada.split(',').map((numero) => catalogo[Number(numero.trim()) - 1]?.id);
        try { selecionarHabilidades(ids); return ids; }
        catch (error) { terminal.escrever(error.message); }
    }
}

async function selecionarClasse(terminal, mundo) {
    const validas = [];
    for (const classe of mundo.classes) {
        try {
            const atributos = calcularAtributos(classe);
            validas.push({ valor: classe.id, rotulo: `${classe.nome} — ${classe.descricao}\n     Atributos: ${Object.entries(atributos).map(([nome, valor]) => `${nome} ${valor}`).join(' | ')}` });
        } catch (error) { terminal.escrever(`Classe indisponível: ${classe.nome}. ${error.message}`); }
    }
    if (!validas.length) throw new Error('Nenhuma classe deste mundo respeita as regras de atributos. Revise o JSON.');
    return escolher(terminal, 'CLASSES DO MUNDO', validas);
}

async function selecionarOrigem(terminal, mundo) {
    if (!mundo.racas.length) { terminal.escrever('Este mundo não separa povos jogáveis. Origem: habitante do mundo.'); return null; }
    return escolher(terminal, 'ORIGEM — escolha narrativa, sem bônus numérico adicional', mundo.racas.map((raca) => ({ valor: raca.id, rotulo: `${raca.nome} — ${raca.descricao}\n     ${raca.tracos.join('; ')}` })));
}

async function criarPeloTerminal({ terminal, mundo, arquivoMundo, pastaSaida = path.join(RAIZ, 'output/personagens') }) {
    validarMundo(mundo);
    terminal.escrever(`\nMUNDO: ${mundo.mundo.nome}\n${mundo.mundo.descricao}\nDigite /sair em qualquer pergunta para cancelar.`);
    const pedido = { mundo_id: path.basename(arquivoMundo) };
    pedido.classe_id = await selecionarClasse(terminal, mundo);
    pedido.raca_id = await selecionarOrigem(terminal, mundo);
    pedido.nome = await perguntarTexto(terminal, '\nNome do personagem: ', 2, 60);
    pedido.descricao_visual = await perguntarTexto(terminal, 'Aparência e identidade (10–1.000 caracteres): ', 10, 1000);
    pedido.habilidades_ids = await escolherHabilidades(terminal);

    while (true) {
        const ficha = criarPersonagem(pedido, mundo);
        terminal.escrever(`\nREVISÃO DA FICHA\nNome: ${ficha.nome}\nClasse: ${ficha.classe}\nOrigem: ${ficha.raca}\nAparência: ${ficha.descricao_visual}\nNível: ${ficha.nivel} | Vida: ${ficha.vida} | Energia: ${ficha.energia}`);
        terminal.escrever(`Atributos: ${Object.entries(ficha.atributos).map(([nome, valor]) => `${nome}: ${valor}`).join(' | ')}`);
        terminal.escrever(`Inventário: ${ficha.inventario.map((item) => item.nome).join(', ') || 'Vazio'}`);
        ficha.habilidades.forEach((h) => terminal.escrever(`  ${resumoHabilidade(h)}`));
        const confirmar = (await terminal.perguntar('\nConfirmar e salvar? [s/n]: ')).toLowerCase();
        if (['s', 'sim'].includes(confirmar)) {
            ficha.mundo_hash = hashMundo(mundo);
            ficha.mundo_arquivo = path.relative(RAIZ, arquivoMundo);
            const arquivo = await salvarNovo(pastaSaida, 'personagem', ficha);
            terminal.escrever(`\nPersonagem salvo em: ${arquivo}\n${JSON.stringify(ficha, null, 2)}`);
            return { ficha, arquivo };
        }
        if (!['n', 'nao', 'não'].includes(confirmar)) { terminal.escrever('Responda s ou n.'); continue; }
        const alteracao = await escolher(terminal, 'O que deseja revisar?', [
            { rotulo: 'Nome e aparência', valor: 'identidade' }, { rotulo: 'Classe', valor: 'classe' },
            { rotulo: 'Origem', valor: 'origem' }, { rotulo: 'Habilidades', valor: 'habilidades' },
            { rotulo: 'Cancelar sem salvar', valor: 'cancelar' },
        ]);
        if (alteracao === 'cancelar') { terminal.escrever('Criação cancelada. Nenhum personagem foi salvo.'); return null; }
        if (alteracao === 'identidade') {
            pedido.nome = await perguntarTexto(terminal, 'Nome: ', 2, 60);
            pedido.descricao_visual = await perguntarTexto(terminal, 'Aparência: ', 10, 1000);
        } else if (alteracao === 'classe') pedido.classe_id = await selecionarClasse(terminal, mundo);
        else if (alteracao === 'origem') pedido.raca_id = await selecionarOrigem(terminal, mundo);
        else pedido.habilidades_ids = await escolherHabilidades(terminal);
    }
}

async function main({ argumento = process.argv[2], terminal = criarTerminal(), pastaMundos = path.join(RAIZ, 'output/mundos'), pastaSaida } = {}) {
    try {
        let selecionado;
        if (argumento) { const arquivo = path.resolve(argumento); selecionado = { arquivo, dados: validarMundo(await lerJson(arquivo)) }; }
        else {
            const arquivos = await listarJson(pastaMundos, validarMundo);
            if (!arquivos.length) throw new Error('Nenhum mundo válido encontrado em output/mundos. Gere um com npm run mundo ou informe o caminho de um JSON.');
            selecionado = await escolher(terminal, 'ESCOLHA UM MUNDO', arquivos.map((item) => ({ valor: item, rotulo: `${item.dados.mundo.nome} — ${path.basename(item.arquivo)}` })));
        }
        return await criarPeloTerminal({ terminal, mundo: selecionado.dados, arquivoMundo: selecionado.arquivo, pastaSaida });
    } finally { terminal.fechar(); }
}

if (require.main === module) main().catch((error) => { console.error(error.message); if (error.code !== 'CANCELADO') process.exitCode = 1; });
module.exports = { main, criarPeloTerminal, resumoHabilidade };
