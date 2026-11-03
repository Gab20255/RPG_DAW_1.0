const caminhos = require('node:path');
const { criarTerminal, escolher, perguntarTexto } = require('./terminal/io');
const { RAIZ, lerJson, listarJson, salvarNovo, salvarAtomico } = require('./terminal/arquivos');
const { validarMundo } = require('./prompts/mundoPrompt');
const { criarPromptMestre } = require('./prompts/mestrePrompt');
const { criarPeloTerminal, resumoHabilidade } = require('./personagem-terminal');
const { RepositorioRpg, criarRpg, validarRpg, editarIdentidade, criarVersao } = require('./services/rpgService');
const { registrarAcao, montarContexto, narrarPendente } = require('./services/partidaService');
const ServicoModelo = require('./services/geminiService');
const { ampliarGeracao, validarGeracao } = require('./services/geracaoMundoService');
const { iniciarMundoPorBase } = require('./services/basesRpgService');
const { obterAgentes } = require('./prompts/agentesMundoPrompt');
const { iniciarCampanha, migrarCampanha, validarCampanha, obterMundoCampanha, registrarAcaoCampanha, CondutorCampanha } = require('./services/campanhaService');
const { obterParticipante } = require('./services/participantesCampanhaService');
const { descreverTeste } = require('./rules/testes');
const { montarContextoCampanha } = require('./services/contextoCampanhaService');
const { PROMPT_CAMPANHA } = require('./prompts/campanhaPrompt');
const { prepararEstadoMecanico, idJogador } = require('./services/combateService');

const { obterConfiguracao } = require('./services/configuracaoService');

function normalizar(texto) { return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

class AplicacaoRpg {
    constructor({ terminal, raiz = RAIZ, repositorio, rolar, criarServico = () => new ServicoModelo(obterConfiguracao()) }) {
        this.terminal = terminal;
        this.raiz = caminhos.resolve(raiz);
        this.pastas = Object.fromEntries(['mundos', 'geracoes', 'personagens', 'partidas', 'contextos', 'diagnosticos'].map((nome) => [nome, caminhos.join(this.raiz, 'output', nome)]));
        this.repositorio = repositorio || new RepositorioRpg(caminhos.join(this.raiz, 'output/rpgs'));
        this.criarServico = criarServico;
        this.servico = null;
        this.rpg = null;
        this.preparacao = null;
        this.condutorCampanha = null;
        this.participanteId = null;
        this.rolar = rolar;
    }

    obterServico() { return this.servico ||= this.criarServico(); }

    exigirRpg() {
        if (this.preparacao) throw new Error('Personagens ainda não definidos.');
        if (!this.rpg) throw new Error('Nenhum RPG aberto.');
        return this.rpg;
    }

    obterFichaAtual() {
        if (!this.preparacao) return this.exigirRpg().estado.personagem;
        const participante = obterParticipante(this.preparacao.dados.campanha, this.participanteId);
        if (!participante) throw new Error('Nenhuma ficha vinculada.');
        const mundo = this.preparacao.dados;
        const estado = prepararEstadoMecanico(mundo.campanha, obterMundoCampanha(mundo, mundo.campanha)).combatentes.find(item => item.id === idJogador(participante.id));
        return { ...participante.ficha, vida: estado.vida, energia: estado.energia };
    }

    async vincularFicha(argumento) {
        if (!this.preparacao) throw new Error('Nenhuma campanha narrativa aberta.');
        const partes = argumento.match(/^(\S+)\s+(?:"([^"]+)"|(\S+))$/);
        if (!partes) throw new Error('Participante ou arquivo inválido.');
        const ficha = await lerJson(caminhos.resolve(this.raiz, partes[2] || partes[3]));
        await this.condutorCampanha.vincular(partes[1], ficha);
        this.participanteId = partes[1];
        this.terminal.escrever(`Participante: ${partes[1]} — ${ficha.nome}`);
    }

    mostrarTeste(cena) {
        if (cena.resultado) { this.terminal.escrever(`\n${cena.resultado.eventos.join('\n')}`); return; }
        const participante = this.preparacao.dados.campanha.participantes.find(item => item.id === cena.participante_id);
        this.terminal.escrever(`\n${participante.ficha.nome} — ${descreverTeste(cena.teste)}`);
    }

    mostrarResumo() {
        if (this.preparacao) {
            const mundo = this.preparacao.dados;
            const campanha = mundo.campanha;
            this.terminal.escrever(`\n${mundo.mundo.nome}\nBase: ${mundo.origem?.base_nome || 'Mundo importado'}\nTurno: ${campanha.turno}\nEstado: ${campanha.estado}\nObjetivo: ${campanha.direcao.objetivo}\n${campanha.resumo}`);
            if (campanha.pendente) this.terminal.escrever('Cena pendente.');
            return;
        }
        const rpg = this.exigirRpg();
        const personagem = rpg.estado.personagem;
        const ambiente = rpg.mundo.ambientes.find((local) => local.id === rpg.estado.ambiente_id);
        this.terminal.escrever(`\n${rpg.nome} — versão ${rpg.edicao || 1}\nMundo: ${rpg.mundo.mundo.nome}\nPersonagem: ${personagem.nome} — ${personagem.classe} — ${personagem.raca}\nLocal atual: ${ambiente.nome}\nVida: ${personagem.vida}/${personagem.vida_max} | Energia: ${personagem.energia}/${personagem.energia_max}\nAcontecimentos registrados: ${rpg.estado.eventos.length}`);
        if (rpg.aprofundamento_pendente) this.terminal.escrever('Aprofundamento pendente.');
    }

    mostrarMundo(mundo) {
        const inicial = mundo.ambientes.find((ambiente) => ambiente.id === mundo.mundo.ambiente_inicial_id);
        this.terminal.escrever(`\nMundo\n${mundo.mundo.nome}\n${mundo.mundo.descricao}\n\nTema\n${mundo.mundo.tema}\n\nTom\n${mundo.mundo.tom}`);
        this.terminal.escrever(`\nHistória\n${mundo.historia.passado}\n\nSituação atual\n${mundo.historia.situacao_atual}\n\nConflito\n${mundo.historia.conflito_principal}\n\nObjetivo\n${mundo.historia.objetivo_principal}\n\nPrelúdio\n${mundo.historia.preludio}`);
        this.terminal.escrever(`\nCenário inicial\n${inicial.nome}\n${inicial.descricao}\n\nPrompt visual\n${inicial.prompt_imagem}`);
        this.terminal.escrever('\nLocais');
        mundo.ambientes.forEach((ambiente) => {
            const conexoes = ambiente.conexoes_ids.map((identificador) => mundo.ambientes.find((local) => local.id === identificador).nome);
            this.terminal.escrever(`${ambiente.nome} — ${ambiente.tipo}\n${ambiente.descricao}\n${ambiente.importancia}\nConexões: ${conexoes.join(', ') || 'Nenhuma'}`);
        });
        for (const [titulo, colecao] of [['Facções', mundo.faccoes], ['NPCs', mundo.personagens], ['Criaturas', mundo.criaturas], ['Itens', mundo.itens], ['Classes', mundo.classes], ['Povos', mundo.racas]]) {
            if (!colecao.length) continue;
            this.terminal.escrever(`\n${titulo}`);
            colecao.forEach((item) => this.terminal.escrever(`${item.nome}\n${item.descricao}`));
        }
        this.terminal.escrever('\nMissões');
        mundo.missoes.forEach((missao) => this.terminal.escrever(`${missao.titulo}\n${missao.descricao}\n${missao.objetivo}`));
        for (const capitulo of mundo.historia.capitulos || []) {
            this.terminal.escrever(`\n${capitulo.titulo}\n${capitulo.sinopse}\n${capitulo.desenvolvimento}`);
            capitulo.cenas.forEach(cena => this.terminal.escrever(`\n${cena.nome}\n${cena.descricao}\nObjetivo: ${cena.objetivo}\nPistas: ${cena.pistas.join('; ')}\nAbordagens: ${cena.abordagens.join('; ')}\nConsequências: ${cena.consequencias.join('; ')}`));
            this.terminal.escrever(`Desfechos possíveis: ${capitulo.desfechos_possiveis.join('; ')}`);
        }
        this.terminal.escrever('\nGanchos de aventura');
        mundo.ganchos_aventura.forEach(gancho => this.terminal.escrever(gancho));
    }

    async escolherMundo() {
        const arquivos = await listarJson(this.pastas.mundos, validarMundo);
        if (!arquivos.length) throw new Error('Nenhum mundo válido encontrado.');
        return escolher(this.terminal, 'Mundo', arquivos.map((item) => ({ valor: item, rotulo: `${item.dados.mundo.nome} — ${caminhos.basename(item.arquivo)}` })));
    }

    async novoRpg(argumento = '') {
        const nome = await perguntarTexto(this.terminal, '\nNome: ', 2, 80);
        let dados;
        if (argumento) {
            const arquivo = caminhos.resolve(this.raiz, argumento.trim().replace(/^"(.*)"$/, '$1'));
            dados = validarMundo(await lerJson(arquivo));
            dados.mundo.nome = nome;
            if (dados.premissa) dados.premissa.titulo = nome;
            dados.preparacao ||= { etapa: 'historia_inicial', proxima_etapa: 'participantes', adaptacao: 'importada', motivo_local: null };
            dados.preparacao.etapa = 'historia_inicial';
            dados.campanha = iniciarCampanha(dados);
        }
        else {
            const historia = await perguntarTexto(this.terminal, 'História: ', 5, 2000);
            const tom = await perguntarTexto(this.terminal, 'Tom: ', 0, 1000);
            this.terminal.escrever('Base…');
            dados = await iniciarMundoPorBase({ titulo: nome, historia, tom },
                (pedido, bases) => this.obterServico().selecionarBase(pedido, bases),
                (pedido, contexto) => {
                    this.terminal.escrever('História inicial…');
                    return this.obterServico().adaptarBase(pedido, contexto);
                });
            this.terminal.escrever(`Base: ${dados.origem.base_nome}${dados.origem.selecao === 'local' ? ' (seleção local)' : ''}`);
            if (dados.preparacao.adaptacao === 'local') this.terminal.escrever('Adaptação: local.');
        }
        const arquivo = await salvarNovo(this.pastas.mundos, 'mundo-base', dados);
        this.abrirPreparacao({ arquivo, dados });
        this.terminal.escrever(`\nArquivo: ${arquivo}`);
    }

    abrirPreparacao(selecionado) {
        validarMundo(selecionado.dados);
        const dados = structuredClone(selecionado.dados);
        dados.campanha = dados.campanha ? migrarCampanha(dados.campanha, dados) : iniciarCampanha(dados);
        this.preparacao = { ...selecionado, dados };
        this.rpg = null;
        this.participanteId = null;
        this.condutorCampanha = new CondutorCampanha({
            carregar: async () => ({ mundo: this.preparacao.dados, campanha: this.preparacao.dados.campanha }),
            salvar: campanha => this.salvarPreparacao(campanha),
            consultar: contexto => this.obterServico().continuarCampanha(contexto),
            rolar: this.rolar,
            aoResultado: cena => this.mostrarTeste(cena),
        });
        this.terminal.escrever(`\n${dados.mundo.nome}\n\n${dados.campanha.turno ? 'Última cena' : 'História inicial'}\n${dados.campanha.diario.at(-1)?.narracao || dados.historia.preludio}`);
        if (dados.campanha.pendente) this.terminal.escrever('Cena pendente.');
    }

    async salvarPreparacao(campanha = this.preparacao?.dados.campanha) {
        if (!this.preparacao) throw new Error('Nenhuma campanha aberta.');
        const dados = structuredClone(this.preparacao.dados);
        dados.campanha = structuredClone(validarCampanha(campanha, dados));
        dados.preparacao ||= { proxima_etapa: 'participantes', adaptacao: 'importada', motivo_local: null };
        dados.preparacao.etapa = campanha.estado === 'concluida' ? 'campanha_concluida' : campanha.turno ? 'campanha_em_andamento' : 'historia_inicial';
        await salvarAtomico(this.preparacao.arquivo, dados);
        this.preparacao = { ...this.preparacao, dados };
    }

    async continuarCampanha(entrada) {
        try {
            const resultado = await this.condutorCampanha.executar(entrada, { participanteId: this.participanteId });
            if (resultado.narracao) this.terminal.escrever(`\n${resultado.narracao}`);
            else if (entrada === '/descartar') this.terminal.escrever('Cena pendente descartada.');
            if (resultado.campanha.estado === 'concluida') this.terminal.escrever('Campanha concluída.');
            else if (resultado.campanha.diario.at(-1)?.exige_resolucao_mecanica) this.terminal.escrever('Resolução mecânica pendente.');
        } catch (erro) {
            this.terminal.escrever(`Erro: ${erro.message}`);
            if (this.preparacao?.dados.campanha.pendente) this.terminal.escrever('Cena pendente.');
            await this.salvarDiagnostico(erro);
        }
    }

    mostrarMemoria() {
        const campanha = this.preparacao?.dados.campanha;
        if (!campanha) throw new Error('Nenhuma campanha narrativa aberta.');
        this.terminal.escrever(`\nResumo\n${campanha.resumo}`);
        for (const [campo, titulo] of [['fatos', 'Fatos'], ['pistas', 'Pistas'], ['decisoes', 'Ações registradas'], ['acontecimentos', 'Acontecimentos']]) {
            this.terminal.escrever(`\n${titulo}`);
            campanha.memoria[campo].forEach(item => this.terminal.escrever(`[${item.turno}] ${item.participante_id ? `${item.participante_id}: ` : ''}${item.texto}`));
        }
        this.terminal.escrever('\nTestes');
        campanha.diario.filter(cena => cena.teste).forEach(cena => this.terminal.escrever(`[${cena.turno}] ${cena.participante_id}: ${descreverTeste(cena.teste)}`));
        if (campanha.pendente?.teste) this.terminal.escrever(`Pendente — ${campanha.pendente.participante_id}: ${descreverTeste(campanha.pendente.teste)}`);
        this.terminal.escrever('\nResultados mecânicos');
        campanha.diario.filter(cena => cena.resultado).forEach(cena => this.terminal.escrever(`[${cena.turno}] ${cena.participante_id}: ${cena.resultado.resumo}`));
        if (campanha.pendente?.resultado) this.terminal.escrever(`Pendente — ${campanha.pendente.participante_id}: ${campanha.pendente.resultado.resumo}`);
        const mundo = obterMundoCampanha(this.preparacao.dados, campanha);
        this.terminal.escrever(`\nNPCs encontrados\n${campanha.memoria.npcs_encontrados.map(id => mundo.personagens.find(npc => npc.id === id).nome).join(', ')}`);
    }

    async listarPreparacoes() {
        return listarJson(this.pastas.mundos, mundo => {
            validarMundo(mundo);
            if (!['historia_inicial', 'campanha_em_andamento', 'campanha_concluida'].includes(mundo.preparacao?.etapa)) throw new Error('Não é uma preparação.');
            if (mundo.campanha) validarCampanha(mundo.campanha, mundo);
        }, 10 * 1024 * 1024);
    }

    async gerarMundo(geracao, arquivoGeracao) {
        try {
            const dados = validarMundo(await this.obterServico().gerarMundo(geracao.pedido, 1, {
                geracao,
                aoProgresso: titulo => this.terminal.escrever(`${titulo}…`),
                aoSalvar: progresso => salvarAtomico(arquivoGeracao, progresso),
            }));
            const arquivo = caminhos.join(this.pastas.mundos, `mundo-${caminhos.basename(arquivoGeracao)}`);
            await salvarAtomico(arquivo, dados);
            this.terminal.escrever(`Mundo: ${arquivo}`);
            if (dados.verificacao?.recuperacoes.length) this.terminal.escrever(`Recuperações locais: ${dados.verificacao.recuperacoes.length}`);
            if (dados.verificacao?.coerencia_ia === 'pendente') this.terminal.escrever('Revisão narrativa: pendente.');
            return { arquivo, dados };
        } catch (erro) {
            this.terminal.escrever(`Geração: ${arquivoGeracao}`);
            throw erro;
        }
    }

    async retomarRpg(argumento = '') {
        let selecionada;
        if (argumento) {
            const arquivo = caminhos.resolve(this.raiz, argumento.trim().replace(/^"(.*)"$/, '$1'));
            selecionada = { arquivo, dados: validarGeracao(await lerJson(arquivo, 10 * 1024 * 1024)) };
        } else {
            const geracoes = await listarJson(this.pastas.geracoes, validarGeracao);
            if (!geracoes.length) throw new Error('Nenhuma geração salva.');
            selecionada = await escolher(this.terminal, 'Geração', geracoes.map(item => ({ valor: item, rotulo: `${caminhos.basename(item.arquivo)} — ${Object.keys(item.dados.etapas).length}/${obterAgentes(item.dados).length}` })));
        }
        let pedido;
        try { pedido = JSON.parse(selecionada.dados.pedido); } catch { throw new Error('Pedido da aventura inválido.'); }
        if (typeof pedido.nome_aventura !== 'string') throw new Error('Nome da aventura ausente.');
        const mundo = await this.gerarMundo(selecionada.dados, selecionada.arquivo);
        await this.criarPersonagem(pedido.nome_aventura, mundo);
    }

    async criarPersonagem(nome, selecionado) {
        if (selecionado.dados.origem?.tipo === 'base_pronta') {
            const mundo = selecionado.dados;
            this.terminal.escrever(`\n${nome}\n\nHistória\n${mundo.historia.passado}\n\nTom\n${mundo.mundo.tom}\n\nCenário inicial\n${mundo.historia.preludio}`);
        } else this.mostrarMundo(selecionado.dados);
        const resultado = await criarPeloTerminal({ terminal: this.terminal, mundo: selecionado.dados, arquivoMundo: selecionado.arquivo, salvarArquivo: false });
        if (!resultado) return;
        const rpg = criarRpg(nome, selecionado.dados, resultado.ficha);
        rpg.aprofundamento_pendente = false;
        this.rpg = await this.repositorio.salvar(rpg);
        this.preparacao = null;
        this.terminal.escrever('\nRPG salvo.');
        this.mostrarResumo();
    }

    async ampliarRpg(argumento) {
        if (!argumento) throw new Error('Arquivo de geração ausente.');
        const origem = caminhos.resolve(this.raiz, argumento.trim().replace(/^"(.*)"$/, '$1'));
        const geracao = ampliarGeracao(await lerJson(origem, 10 * 1024 * 1024));
        geracao.origem_geracao = origem;
        const arquivo = await salvarNovo(this.pastas.geracoes, 'campanha', geracao);
        const pedido = JSON.parse(geracao.pedido);
        const mundo = await this.gerarMundo(geracao, arquivo);
        await this.criarPersonagem(pedido.nome_aventura, mundo);
    }

    async listarSalvos() {
        const salvos = await this.repositorio.listar();
        const preparacoes = await this.listarPreparacoes();
        if (!salvos.length && !preparacoes.length) { this.terminal.escrever('Nenhum RPG salvo.'); return; }
        salvos.forEach((rpg, indice) => this.terminal.escrever(`${indice + 1}. ${rpg.nome} — versão ${rpg.edicao || 1} — ${rpg.estado.personagem.nome} — ${rpg.mundo.mundo.nome} — ${rpg.estado.eventos.length} acontecimento(s)`));
        preparacoes.forEach((item, indice) => this.terminal.escrever(`${salvos.length + indice + 1}. ${item.dados.mundo.nome} — turno ${item.dados.campanha?.turno || 0} — ${item.dados.campanha?.estado || 'história inicial'}`));
    }

    async carregarRpg(argumento = '') {
        const caminhoInformado = argumento.trim().replace(/^"(.*)"$/, '$1');
        let selecionado;
        if (caminhoInformado.endsWith('.json')) {
            const arquivo = caminhos.resolve(this.raiz, caminhoInformado);
            const dados = await lerJson(arquivo, 10 * 1024 * 1024);
            selecionado = { tipo: dados.estado && dados.mundo ? 'rpg' : dados.mundo?.ambiente_inicial_id ? 'preparacao' : 'ficha', dados, arquivo };
        } else {
            const salvos = await this.repositorio.listar();
            const identificadores = new Set(salvos.map((rpg) => rpg.estado.personagem.id));
            const antigas = await listarJson(this.pastas.personagens, (ficha) => { if (!ficha.id || !ficha.mundo_arquivo) throw new Error('Ficha inválida.'); });
            const preparacoes = await this.listarPreparacoes();
            let opcoes = [
                ...salvos.map((rpg) => ({ rotulo: `${rpg.nome} — versão ${rpg.edicao || 1} — ${rpg.estado.personagem.nome} (${rpg.estado.personagem.classe}) — ${rpg.mundo.mundo.nome} — ${rpg.estado.eventos.length} acontecimento(s)${this.rpg?.id === rpg.id ? ' [aberto]' : ''}`, valor: { tipo: 'rpg', dados: rpg } })),
                ...antigas.filter((item) => !identificadores.has(item.dados.id)).map((item) => ({ rotulo: `Ficha antiga: ${item.dados.nome} — ${item.dados.mundo_nome}`, valor: { tipo: 'ficha', dados: item.dados } })),
                ...preparacoes.map(item => ({ rotulo: `${item.dados.mundo.nome} — turno ${item.dados.campanha?.turno || 0} — ${item.dados.campanha?.estado || 'história inicial'} — ${caminhos.basename(item.arquivo)}`, valor: { tipo: 'preparacao', ...item } })),
            ];
            if (caminhoInformado) opcoes = opcoes.filter((opcao) => normalizar(opcao.rotulo).includes(normalizar(caminhoInformado)) || opcao.valor.dados.id === caminhoInformado);
            if (!opcoes.length) throw new Error('RPG ou ficha não encontrado.');
            selecionado = caminhoInformado && opcoes.length === 1 ? opcoes[0].valor : await escolher(this.terminal, 'RPG', opcoes);
        }
        if (selecionado.tipo === 'preparacao') {
            this.abrirPreparacao(selecionado);
            return;
        }
        let rpg;
        if (selecionado.tipo === 'rpg') rpg = validarRpg(selecionado.dados);
        else {
            const ficha = selecionado.dados;
            const mundo = validarMundo(await lerJson(caminhos.resolve(RAIZ, ficha.mundo_arquivo)));
            rpg = criarRpg(`${mundo.mundo.nome} — ${ficha.nome}`, mundo, ficha);
            try {
                const estado = await lerJson(caminhos.join(this.pastas.partidas, `partida-${ficha.id}.json`));
                rpg.estado = estado;
                validarRpg(rpg);
            } catch (erro) { if (erro.code !== 'ENOENT') throw erro; }
        }
        this.rpg = await this.repositorio.salvar(rpg);
        this.preparacao = null;
        this.terminal.escrever('\nRPG carregado.');
        this.mostrarResumo();
        const ultimo = this.rpg.estado.eventos.at(-1);
        if (ultimo?.narracao) this.terminal.escrever(`\nÚltima cena:\n${ultimo.narracao.narracao}`);
        else if (ultimo) this.terminal.escrever('Narração pendente.');
        else this.terminal.escrever(`\n${this.rpg.mundo.historia.preludio}`);
    }

    async editarRpg(argumento = '') {
        if (argumento || (!this.rpg && !this.preparacao)) await this.carregarRpg(argumento);
        if (this.preparacao) throw new Error('Edição de fichas indisponível nesta etapa.');
        const original = this.exigirRpg();
        const opcao = await escolher(this.terminal, `Editar ${original.nome}`, [
            { rotulo: 'Nome', valor: 'nome' },
            { rotulo: 'Identidade', valor: 'identidade' },
            { rotulo: 'Personagem', valor: 'personagem' },
            { rotulo: 'Mundo', valor: 'mundo' },
            { rotulo: 'Voltar', valor: 'voltar' },
        ]);
        if (opcao === 'voltar') return;
        let alterado;
        if (opcao === 'nome') alterado = editarIdentidade(original, { nome: await perguntarTexto(this.terminal, 'Nome: ', 2, 80) });
        else if (opcao === 'identidade') {
            const personagem = original.estado.personagem;
            const nomePersonagem = await this.terminal.perguntar(`Nome [${personagem.nome}]: `) || personagem.nome;
            this.terminal.escrever(`Aparência atual: ${personagem.descricao_visual}`);
            const descricaoVisual = await this.terminal.perguntar('Aparência: ') || personagem.descricao_visual;
            alterado = editarIdentidade(original, { nomePersonagem, descricaoVisual });
        } else if (opcao === 'personagem') {
            const resultado = await criarPeloTerminal({ terminal: this.terminal, mundo: original.mundo, arquivoMundo: caminhos.resolve(RAIZ, original.estado.personagem.mundo_arquivo), salvarArquivo: false });
            if (!resultado) return;
            alterado = criarVersao(original, original.mundo, resultado.ficha);
        } else {
            const mundo = structuredClone(original.mundo);
            for (const [grupo, campo, rotulo] of [
                ['mundo', 'nome', 'Nome do mundo'], ['mundo', 'tema', 'Tema'], ['mundo', 'tom', 'Tom e atmosfera'],
                ['mundo', 'descricao', 'Descrição do mundo'], ['historia', 'passado', 'Passado'],
                ['historia', 'situacao_atual', 'Situação atual'], ['historia', 'conflito_principal', 'Conflito principal'],
                ['historia', 'objetivo_principal', 'Objetivo'], ['historia', 'preludio', 'Prelúdio'],
            ]) {
                this.terminal.escrever(`\n${rotulo} atual: ${mundo[grupo][campo]}`);
                const resposta = await this.terminal.perguntar(`${rotulo}: `);
                if (resposta.length > 12000) throw new Error('Campo excede 12.000 caracteres.');
                if (resposta) mundo[grupo][campo] = resposta;
            }
            alterado = criarVersao(original, validarMundo(mundo));
        }
        this.rpg = await this.repositorio.salvar(alterado);
        this.terminal.escrever(alterado.id === original.id ? 'Salvo.' : 'Versão salva.');
        this.mostrarResumo();
    }

    async enriquecerRpg() {
        const original = this.exigirRpg();
        this.terminal.escrever('História…');
        const mundo = await this.obterServico().aprofundarMundo(original.mundo, 1);
        const aprofundado = criarVersao(original, validarMundo(mundo));
        aprofundado.aprofundamento_pendente = false;
        this.rpg = await this.repositorio.salvar(aprofundado);
        this.mostrarMundo(this.rpg.mundo);
        this.terminal.escrever('Versão salva.');
    }

    async exportarContexto() {
        if (this.preparacao) {
            const mundo = this.preparacao.dados;
            if (mundo.campanha.estado === 'concluida') throw new Error('Campanha concluída.');
            const campanha = mundo.campanha.pendente ? mundo.campanha : registrarAcaoCampanha(mundo.campanha, mundo, '/observar', { participanteId: this.participanteId });
            const arquivo = await salvarNovo(this.pastas.contextos, 'contexto', { instrucao_sistema: PROMPT_CAMPANHA, contexto: montarContextoCampanha(mundo, campanha) });
            this.terminal.escrever(`Contexto: ${arquivo}`);
            return;
        }
        const rpg = this.exigirRpg();
        const estado = rpg.estado.eventos.length ? rpg.estado : registrarAcao(rpg.estado, rpg.mundo, '/observar');
        const limite = Number(process.env.NARRATION_MAX_TOKENS || 1600);
        const arquivo = await salvarNovo(this.pastas.contextos, 'contexto', { instrucao_sistema: criarPromptMestre(limite), contexto: montarContexto(estado, rpg.mundo) });
        this.terminal.escrever(`Contexto: ${arquivo}`);
    }

    async narrarAcao(entrada) {
        const atual = this.exigirRpg();
        if (entrada !== '/repetir') {
            const proximo = structuredClone(atual);
            proximo.estado = registrarAcao(atual.estado, atual.mundo, entrada);
            this.rpg = await this.repositorio.salvar(proximo);
        }
        const evento = this.rpg.estado.eventos.at(-1);
        if (!evento) throw new Error('Resultado anterior ausente.');
        if (['teste', 'transicao'].includes(evento.tipo)) this.terminal.escrever(`\n${evento.resumo}`);
        try {
            const servico = evento.narracao ? null : this.obterServico();
            if (!evento.narracao) this.terminal.escrever('\nNarração…');
            const estado = await narrarPendente(this.rpg.estado, this.rpg.mundo, servico);
            const narrado = { ...this.rpg, estado };
            this.rpg = await this.repositorio.salvar(narrado);
            this.terminal.escrever(`\n${estado.eventos.at(-1).narracao.narracao}`);
            const propostas = estado.eventos.at(-1).narracao.propostas;
            if (propostas.length) this.terminal.escrever(`\nPropostas\n${propostas.map((proposta) => `  ${proposta.tipo}: ${proposta.descricao}`).join('\n')}`);
        } catch (erro) {
            this.terminal.escrever(`Erro: ${erro.message}\nNarração pendente.`);
            await this.salvarDiagnostico(erro);
        }
    }

    async salvarDiagnostico(erro) {
        if (!erro.diagnostico) return;
        try { const arquivo = await salvarNovo(this.pastas.diagnosticos, 'resposta', erro.diagnostico); this.terminal.escrever(`Diagnóstico: ${arquivo}`); }
        catch (falha) { this.terminal.escrever(`Erro: ${falha.message}`); }
    }

    async executar(entrada) {
        const comando = entrada.match(/^(\/\S+)(?:\s+([\s\S]*))?$/);
        const nome = comando ? normalizar(comando[1]) : '';
        const argumento = comando?.[2] || '';
        if (!entrada.trim()) return true;
        if (nome === '/sair') return false;
        if (nome === '/novo') await this.novoRpg(argumento);
        else if (nome === '/retomar') await this.retomarRpg(argumento);
        else if (nome === '/expandir') await this.ampliarRpg(argumento);
        else if (nome === '/carregar') await this.carregarRpg(argumento);
        else if (nome === '/listar') await this.listarSalvos();
        else if (nome === '/editar') await this.editarRpg(argumento);
        else if (nome === '/salvar') {
            if (this.preparacao) await this.salvarPreparacao();
            else this.rpg = await this.repositorio.salvar(this.exigirRpg());
            this.terminal.escrever('RPG salvo.');
        }
        else if (nome === '/resumo') this.mostrarResumo();
        else if (nome === '/enriquecer') await this.enriquecerRpg();
        else if (nome === '/contexto') await this.exportarContexto();
        else if (nome === '/memoria') this.mostrarMemoria();
        else if (nome === '/combate') {
            if (!this.preparacao) throw new Error('Nenhuma campanha aberta.');
            const mundo = this.preparacao.dados;
            const estado = prepararEstadoMecanico(mundo.campanha, obterMundoCampanha(mundo, mundo.campanha));
            this.terminal.escrever(`Combate: ${estado.encontro?.estado || 'inativo'}${estado.encontro ? ` — Rodada ${estado.encontro.rodada}` : ''}`);
            estado.combatentes.filter(item => item.ambiente_id === mundo.campanha.ambiente_id).forEach(item => this.terminal.escrever(`${item.id} — ${item.nome} | Vida ${item.vida}/${item.vida_max} | Energia ${item.energia}/${item.energia_max} | Posição ${item.posicao} m${estado.encontro?.agiram_ids.includes(item.id) ? ' | Já agiu' : ''}${estado.encontro?.retirados_ids.includes(item.id) ? ' | Retirado' : ''}\nEfeitos: ${item.efeitos.map(efeito => `${efeito.tipo} (${efeito.turnos})`).join(', ') || 'nenhum'} | Recargas: ${item.recargas.filter(recarga => recarga.disponivel_no_turno > item.turnos + 1).map(recarga => `${recarga.habilidade_id} (${recarga.disponivel_no_turno - item.turnos - 1})`).join(', ') || 'nenhuma'}`));
        }
        else if (nome === '/vincular') await this.vincularFicha(argumento);
        else if (nome === '/jogador') {
            if (!this.preparacao) throw new Error('Nenhuma campanha narrativa aberta.');
            const participante = obterParticipante(this.preparacao.dados.campanha, argumento.trim());
            this.participanteId = participante.id;
            this.terminal.escrever(`Participante: ${participante.id} — ${participante.ficha.nome}`);
        }
        else if (nome === '/participantes') {
            if (!this.preparacao) throw new Error('Nenhuma campanha narrativa aberta.');
            const participantes = this.preparacao.dados.campanha.participantes;
            if (!participantes.length) this.terminal.escrever('Nenhum participante vinculado.');
            participantes.forEach(item => this.terminal.escrever(`${item.id} — ${item.ficha.nome} — ${item.ficha.classe}${this.participanteId === item.id ? ' [ativo]' : ''}`));
        }
        else if (nome === '/objetivos') {
            const campanha = this.preparacao?.dados.campanha;
            if (!campanha) throw new Error('Nenhuma campanha narrativa aberta.');
            campanha.objetivos.forEach(item => this.terminal.escrever(`${item.estado} — ${item.descricao}${item.motivo ? `\n${item.motivo}` : ''}`));
        }
        else if (nome === '/mundo') {
            this.mostrarMundo(this.preparacao ? obterMundoCampanha(this.preparacao.dados, this.preparacao.dados.campanha) : this.exigirRpg().mundo);
        } else if (nome === '/ficha') {
            const personagem = this.obterFichaAtual();
            this.terminal.escrever(`\n${personagem.nome} — ${personagem.classe} — ${personagem.raca}\n${personagem.descricao_visual}\nNível ${personagem.nivel} | Vida ${personagem.vida}/${personagem.vida_max} | Energia ${personagem.energia}/${personagem.energia_max}\n${Object.entries(personagem.atributos).map(([atributo, valor]) => `${atributo}: ${valor}`).join(' | ')}\nInventário: ${personagem.inventario.map((item) => item.nome).join(', ')}`);
        } else if (nome === '/habilidades') this.obterFichaAtual().habilidades.forEach((habilidade) => this.terminal.escrever(`${resumoHabilidade(habilidade)}\n${habilidade.descricao}\nLimite: ${habilidade.limitacao}\nContrajogo: ${habilidade.contrajogo.join(', ')}`));
        else if (nome === '/locais') {
            const rpg = this.preparacao ? { mundo: obterMundoCampanha(this.preparacao.dados, this.preparacao.dados.campanha), estado: { ambiente_id: this.preparacao.dados.campanha.ambiente_id } } : this.exigirRpg();
            const atual = rpg.mundo.ambientes.find((local) => local.id === rpg.estado.ambiente_id);
            this.terminal.escrever(`\n${atual.nome}\n${atual.descricao}`);
            atual.conexoes_ids.forEach((identificador, indice) => this.terminal.escrever(`${indice + 1}. ${rpg.mundo.ambientes.find((local) => local.id === identificador).nome}`));
            if (!atual.conexoes_ids.length) this.terminal.escrever('Nenhuma conexão conhecida.');
        } else if (nome === '/historico') {
            const eventos = this.preparacao ? this.preparacao.dados.campanha.diario.slice(-10) : this.exigirRpg().estado.eventos.slice(-10);
            if (!eventos.length) this.terminal.escrever('Ainda não há acontecimentos.');
            eventos.forEach((evento) => this.terminal.escrever(`\n${evento.participante_id ? `Participante: ${evento.participante_id}\n` : ''}Ação: ${evento.acao}\n${evento.teste ? `${descreverTeste(evento.teste)}\n` : ''}${evento.resultado ? `${evento.resultado.resumo}\n` : ''}${evento.resumo}\n${typeof evento.narracao === 'string' ? evento.narracao : evento.narracao?.narracao || 'Narração pendente.'}`));
        } else if (this.preparacao) await this.continuarCampanha(entrada);
        else await this.narrarAcao(entrada);
        return true;
    }
}

async function principal({ terminal = criarTerminal(), ...opcoes } = {}) {
    require('dotenv').config({ path: caminhos.join(RAIZ, '.env'), override: true, quiet: true });
    const aplicacao = new AplicacaoRpg({ terminal, ...opcoes });
    try {
        while (true) {
            let entrada;
            try { entrada = await terminal.perguntar('\n> '); }
            catch (erro) { if (['CANCELADO', 'ENTRADA_ENCERRADA'].includes(erro.code)) break; throw erro; }
            try { if (!(await aplicacao.executar(entrada))) break; }
            catch (erro) {
                if (erro.code === 'ENTRADA_ENCERRADA') break;
                terminal.escrever(erro.code === 'CANCELADO' ? 'Cancelado.' : `Erro: ${erro.message}`);
                await aplicacao.salvarDiagnostico(erro);
            }
        }
    } finally { terminal.fechar(); }
    return aplicacao;
}

if (require.main === module) {
    const executar = process.argv.includes('--api') ? require('./servidor').executarServidor : principal;
    executar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
}
module.exports = { AplicacaoRpg, principal, obterConfiguracao };
