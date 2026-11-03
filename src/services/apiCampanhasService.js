const { RepositorioCampanhas, validarIdCampanha } = require('../repositorios/campanhasRepositorio');
const { iniciarMundoPorBase, listarBases, validarPedidoBase } = require('./basesRpgService');
const { CondutorCampanha } = require('./campanhaService');
const { obterParticipante, prepararFichaCampanha } = require('./participantesCampanhaService');
const ServicoModelo = require('./geminiService');
const { obterConfiguracao } = require('./configuracaoService');
const { ErroAplicacao } = require('./erroAplicacao');
const { apresentarCampanha, resumirCampanha, apresentarCena } = require('../http/apresentacaoCampanha');

function validarCorpo(corpo, obrigatorios, opcionais = []) {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || obrigatorios.some(campo => !Object.hasOwn(corpo, campo)) || Object.keys(corpo).some(campo => ![...obrigatorios, ...opcionais].includes(campo))) throw new ErroAplicacao(400, 'CORPO_INVALIDO', 'Campos da requisição inválidos.');
}

function validarAutor(campanha, id) {
    if (campanha.participantes.length && !id) throw new ErroAplicacao(400, 'AUTOR_AUSENTE', 'Informe o participante responsável pela ação.');
    try { obterParticipante(campanha, id); }
    catch { throw new ErroAplicacao(422, 'AUTOR_INVALIDO', 'Participante não vinculado à campanha.'); }
}

function tratarErro(erro) {
    if (erro instanceof ErroAplicacao) return erro;
    if (/^CENA_/.test(erro.code || '')) return new ErroAplicacao(502, 'RESPOSTA_IA_INVALIDA', 'A resposta da IA não passou pela validação; a cena permanece pendente.');
    if (erro.code || erro instanceof TypeError || erro instanceof ReferenceError || erro instanceof SyntaxError) return new ErroAplicacao(500, 'FALHA_INTERNA', 'Não foi possível concluir a operação.');
    return new ErroAplicacao(422, 'OPERACAO_INVALIDA', erro.message);
}

class ApiCampanhas {
    constructor({ repositorio = new RepositorioCampanhas(), criarServico = () => new ServicoModelo(obterConfiguracao()), rolar } = {}) {
        this.repositorio = repositorio;
        this.criarServico = criarServico;
        this.rolar = rolar;
        this.servico = null;
        this.sessoes = new Map();
    }

    obterServico() {
        try { return this.servico ||= this.criarServico(); }
        catch { throw new ErroAplicacao(503, 'IA_NAO_CONFIGURADA', 'Configuração da IA indisponível no servidor.'); }
    }

    async consultar(contexto) {
        try { return await this.obterServico().continuarCampanha(contexto); }
        catch (erro) {
            if (erro instanceof ErroAplicacao) throw erro;
            if (erro.status === 429) throw new ErroAplicacao(429, 'LIMITE_IA', 'Limite de requisições da IA atingido.');
            if (erro.status === 402) throw new ErroAplicacao(402, 'CREDITO_IA', 'Crédito ou limite da chave da IA insuficiente.');
            if ([401, 403].includes(erro.status)) throw new ErroAplicacao(503, 'IA_NAO_CONFIGURADA', 'Credencial da IA recusada pelo provedor.');
            if (erro.code === 'CONEXAO_INTERROMPIDA') throw new ErroAplicacao(503, 'IA_INDISPONIVEL', 'Conexão com a IA interrompida; a cena permanece pendente.');
            throw new ErroAplicacao(502, 'FALHA_IA', 'Não foi possível obter uma resposta válida da IA.');
        }
    }

    async obterSessao(id) {
        validarIdCampanha(id);
        await this.repositorio.carregar(id);
        if (!this.sessoes.has(id)) {
            const condutor = new CondutorCampanha({
                carregar: async () => { const mundo = await this.repositorio.carregar(id); return { mundo, campanha: mundo.campanha }; },
                salvar: campanha => this.repositorio.salvar(id, campanha),
                consultar: contexto => this.consultar(contexto), rolar: this.rolar,
            });
            this.sessoes.set(id, { condutor, fila: Promise.resolve() });
        }
        return this.sessoes.get(id);
    }

    async alterar(id, tarefa) {
        const sessao = await this.obterSessao(id);
        const operacao = sessao.fila.then(async () => {
            try { return await tarefa(sessao.condutor, await this.repositorio.carregar(id)); }
            catch (erro) {
                const publico = tratarErro(erro);
                const mundo = await this.repositorio.carregar(id).catch(() => null);
                publico.detalhes = { campanha_id: id, ...(mundo ? { turno: mundo.campanha.turno, pendente: apresentarCena(mundo.campanha.pendente) } : {}) };
                throw publico;
            }
        });
        sessao.fila = operacao.catch(() => {});
        return operacao;
    }

    listarBases() { return listarBases(); }

    async listar() { return (await this.repositorio.listar()).map(({ mundo }) => resumirCampanha(mundo)); }

    async carregar(id) { return apresentarCampanha(await this.repositorio.carregar(id)); }

    async criar(corpo) {
        validarCorpo(corpo, ['titulo', 'historia', 'tom']);
        let pedido;
        try { pedido = validarPedidoBase(corpo); }
        catch (erro) { throw new ErroAplicacao(400, 'PREMISSA_INVALIDA', erro.message); }
        const mundo = await iniciarMundoPorBase(pedido,
            (premissa, bases) => this.obterServico().selecionarBase(premissa, bases),
            (premissa, base) => this.obterServico().adaptarBase(premissa, base));
        return apresentarCampanha(await this.repositorio.criar(mundo));
    }

    async agir(id, corpo) {
        validarCorpo(corpo, ['acao', 'turno_esperado'], ['participante_id']);
        if (typeof corpo.acao !== 'string' || !corpo.acao.trim() || corpo.acao.length > 1000 || !Number.isSafeInteger(corpo.turno_esperado) || corpo.turno_esperado < 0) throw new ErroAplicacao(400, 'ACAO_INVALIDA', 'Ação ou turno esperado inválido.');
        if (['/repetir', '/descartar'].includes(corpo.acao.trim())) throw new ErroAplicacao(400, 'ROTA_INCOMPATIVEL', 'Use a rota específica para repetir ou descartar uma cena.');
        return this.alterar(id, async (condutor, mundo) => {
            const campanha = mundo.campanha;
            if (campanha.turno !== corpo.turno_esperado) throw new ErroAplicacao(409, 'TURNO_DESATUALIZADO', 'O turno mudou; consulte o estado atual da campanha.');
            if (campanha.pendente) throw new ErroAplicacao(409, 'CENA_PENDENTE', 'Há uma cena pendente de conclusão.');
            if (campanha.estado === 'concluida') throw new ErroAplicacao(409, 'CAMPANHA_CONCLUIDA', 'Campanha concluída.');
            validarAutor(campanha, corpo.participante_id ?? null);
            await condutor.executar(corpo.acao.trim(), { participanteId: corpo.participante_id ?? null });
            return this.carregar(id);
        });
    }

    async repetir(id, corpo) {
        validarCorpo(corpo, ['pedido_id'], ['participante_id']);
        validarIdCampanha(corpo.pedido_id);
        return this.alterar(id, async (condutor, mundo) => {
            const campanha = mundo.campanha;
            const cena = campanha.diario.find(item => item.id === corpo.pedido_id);
            const pedido = cena || campanha.pendente;
            if (!pedido || pedido.id !== corpo.pedido_id) throw new ErroAplicacao(409, 'PEDIDO_INCOMPATIVEL', 'Pedido não encontrado nesta campanha.');
            if ((corpo.participante_id ?? null) !== pedido.participante_id) throw new ErroAplicacao(409, 'AUTOR_INCOMPATIVEL', 'O pedido pertence a outro participante.');
            if (!cena) await condutor.executar('/repetir', { participanteId: corpo.participante_id ?? null });
            const atual = await this.repositorio.carregar(id);
            return { campanha: apresentarCampanha(atual), cena: apresentarCena(atual.campanha.diario.find(item => item.id === corpo.pedido_id)) };
        });
    }

    async descartar(id, corpo) {
        validarCorpo(corpo, ['pedido_id'], ['participante_id']);
        validarIdCampanha(corpo.pedido_id);
        return this.alterar(id, async (condutor, mundo) => {
            const pedido = mundo.campanha.pendente;
            if (!pedido || pedido.id !== corpo.pedido_id) throw new ErroAplicacao(409, 'PEDIDO_INCOMPATIVEL', 'A cena pendente mudou.');
            if ((corpo.participante_id ?? null) !== pedido.participante_id) throw new ErroAplicacao(409, 'AUTOR_INCOMPATIVEL', 'O pedido pertence a outro participante.');
            if (pedido.teste || pedido.resultado) throw new ErroAplicacao(409, 'ACAO_JA_RESOLVIDA', 'Uma ação já resolvida não pode ser descartada.');
            await condutor.executar('/descartar', { participanteId: corpo.participante_id ?? null });
            return this.carregar(id);
        });
    }

    async vincular(id, corpo) {
        validarCorpo(corpo, ['participante_id', 'ficha']);
        validarIdCampanha(corpo.participante_id);
        return this.alterar(id, async (condutor, mundo) => {
            const campanha = mundo.campanha;
            if (campanha.pendente || campanha.estado === 'concluida') throw new ErroAplicacao(409, 'VINCULO_INDISPONIVEL', 'Campanha com cena pendente ou já concluída.');
            if (campanha.participantes.some(item => item.id === corpo.participante_id || item.ficha.id === corpo.ficha?.id)) throw new ErroAplicacao(409, 'VINCULO_DUPLICADO', 'Participante ou ficha já vinculado.');
            try { prepararFichaCampanha(corpo.ficha, mundo); }
            catch { throw new ErroAplicacao(422, 'FICHA_INVALIDA', 'Ficha inválida ou incompatível com o mundo e as regras.'); }
            await condutor.vincular(corpo.participante_id, corpo.ficha);
            return this.carregar(id);
        });
    }

    async historico(id, consulta) {
        validarCorpo(consulta, [], ['limite', 'deslocamento']);
        const inteiro = (valor, padrao, maximo) => {
            if (valor === undefined) return padrao;
            if (typeof valor !== 'string' || !/^\d+$/.test(valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) > maximo) throw new ErroAplicacao(400, 'PAGINACAO_INVALIDA', 'Paginação inválida.');
            return Number(valor);
        };
        const limite = inteiro(consulta.limite, 20, 100), deslocamento = inteiro(consulta.deslocamento, 0, Number.MAX_SAFE_INTEGER);
        if (!limite) throw new ErroAplicacao(400, 'PAGINACAO_INVALIDA', 'O limite deve ser maior que zero.');
        const { campanha } = await this.repositorio.carregar(id);
        return { total: campanha.diario.length, limite, deslocamento, cenas: campanha.diario.slice(deslocamento, deslocamento + limite).map(apresentarCena) };
    }
}

module.exports = { ApiCampanhas };
