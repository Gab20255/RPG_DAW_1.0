const { EventEmitter: EmissorEventos } = require('node:events');
const { ErroAplicacao } = require('./erroAplicacao');
const { validarCampos } = require('./autenticacaoService');
const { criarPersonagem, calcularAtributos } = require('./personagemService');
const { vincularParticipante } = require('./campanhaService');
const { hashBaseCampanha } = require('./participantesCampanhaService');
const { apresentarCampanha } = require('../http/apresentacaoCampanha');
const { REGRAS, listarHabilidades } = require('../rules/habilidades');
const { listarAvatares, sugerirAvatar } = require('./avataresService');

const MINIMO_JOGADORES = 2;
const MAXIMO_JOGADORES = 8;

function validarSalaId(id) {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw new ErroAplicacao(400, 'SALA_INVALIDA', 'Identificador de sala inválido.');
    return Number(id);
}

class Salas extends EmissorEventos {
    constructor({ banco, autenticacao, api }) {
        super(); this.banco = banco; this.autenticacao = autenticacao; this.api = api; this.filas = new Map();
    }

    acessar(id, sessao, { ativa = false, anfitriao = false, preparacao = false, iniciada = false } = {}) {
        const usuario = this.autenticacao.conferir(sessao);
        const sala = this.banco.obter('SELECT s.*, sc.campanha_id FROM salas s JOIN salas_campanhas sc ON sc.sala_id = s.id JOIN sala_membros sm ON sm.sala_id = s.id AND sm.usuario_id = ? WHERE s.id = ?', usuario.id, validarSalaId(id));
        if (!sala) throw new ErroAplicacao(404, 'SALA_NAO_ENCONTRADA', 'Sala não encontrada.');
        if (ativa && !sala.ativa) throw new ErroAplicacao(409, 'SALA_ENCERRADA', 'Sala encerrada.');
        if (anfitriao && sala.host_id !== usuario.id) throw new ErroAplicacao(403, 'ACESSO_NEGADO', 'Operação exclusiva do anfitrião.');
        if (preparacao && sala.etapa !== 'preparacao') throw new ErroAplicacao(409, 'PARTIDA_JA_INICIADA', 'A preparação da sala já terminou.');
        if (iniciada && sala.etapa !== 'em_andamento') throw new ErroAplicacao(409, 'PARTIDA_NAO_INICIADA', 'A partida ainda não foi iniciada pelo anfitrião.');
        return sala;
    }

    salaDaCampanha(id, sessao) {
        this.autenticacao.conferir(sessao);
        if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new ErroAplicacao(400, 'CAMPANHA_INVALIDA', 'Identificador inválido.');
        const sala = this.banco.obter('SELECT sala_id FROM salas_campanhas WHERE campanha_id = ?', id);
        if (!sala) throw new ErroAplicacao(404, 'CAMPANHA_NAO_ENCONTRADA', 'Campanha não encontrada.');
        return this.acessar(sala.sala_id, sessao).id;
    }

    apresentar(sala) {
        const membros = this.banco.listar('SELECT u.id AS usuario_id, u.username, f.participante_id, f.personagem_id, sm.pronto FROM sala_membros sm JOIN usuarios u ON u.id = sm.usuario_id LEFT JOIN fichas_campanha f ON f.usuario_id = sm.usuario_id AND f.campanha_id = ? WHERE sm.sala_id = ? ORDER BY sm.entrou_em, u.id', sala.campanha_id, sala.id)
            .map(membro => ({ ...membro, pronto: Boolean(membro.personagem_id && membro.pronto),
                estado: !membro.personagem_id ? 'sem_personagem' : membro.pronto ? 'pronto' : 'ficha_criada' }));
        const pendentes = membros.filter(membro => !membro.pronto).map(membro => membro.usuario_id);
        return { id: sala.id, nome: sala.nome, tema: sala.tema, codigo: sala.codigo, host_id: sala.host_id, ativa: Boolean(sala.ativa), campanha_id: sala.campanha_id,
            etapa: sala.ativa ? sala.etapa : 'encerrada', iniciada_em: sala.iniciada_em, revisao_preparacao: sala.revisao_preparacao, membros,
            preparacao: { minimo_jogadores: MINIMO_JOGADORES, maximo_jogadores: MAXIMO_JOGADORES,
                jogadores_prontos: membros.length - pendentes.length, pendentes,
                pronta_para_iniciar: Boolean(sala.ativa && sala.etapa === 'preparacao' && membros.length >= MINIMO_JOGADORES && membros.length <= MAXIMO_JOGADORES && !pendentes.length) } };
    }

    async catalogo(id, consulta, sessao) {
        validarCampos(consulta, []);
        const sala = this.acessar(id, sessao);
        const mundo = await this.api.repositorio.carregar(sala.campanha_id);
        const publico = apresentarCampanha(mundo).mundo;
        const itensIniciais = new Set(mundo.classes.flatMap(classe => classe.itens_iniciais_ids));
        return {
            sala_id: sala.id, campanha_id: sala.campanha_id,
            selecao_aberta: Boolean(sala.ativa && sala.etapa === 'preparacao'),
            regras: { nivel_inicial: REGRAS.nivelInicial, habilidades_por_personagem: REGRAS.habilidadesIniciais,
                vida_inicial: REGRAS.vidaInicial, energia_inicial: REGRAS.energiaInicial, origem_obrigatoria: mundo.racas.length > 0 },
            classes: mundo.classes.map(classe => ({ id: classe.id, nome: classe.nome, descricao: classe.descricao,
                bonus_atributos: structuredClone(classe.bonus_atributos), atributos: calcularAtributos(classe), itens_iniciais_ids: [...classe.itens_iniciais_ids],
                avatar_sugerido_id: sugerirAvatar({ classe_id: classe.id, descricao_visual: '' }, mundo).id })),
            racas: publico.racas, itens_iniciais: publico.itens.filter(item => itensIniciais.has(item.id)),
            habilidades: listarHabilidades(REGRAS.nivelInicial),
            avatares: listarAvatares(mundo),
        };
    }

    async preverAvatar(id, corpo, sessao) {
        validarCampos(corpo, ['classe_id', 'descricao_visual']);
        if (typeof corpo.descricao_visual !== 'string' || corpo.descricao_visual.trim().length > 1000) throw new ErroAplicacao(400, 'DESCRICAO_INVALIDA', 'Descrição visual deve ter até 1000 caracteres.');
        const sala = this.acessar(id, sessao);
        const mundo = await this.api.repositorio.carregar(sala.campanha_id);
        if (!mundo.classes.some(classe => classe.id === corpo.classe_id)) throw new ErroAplicacao(422, 'CLASSE_INVALIDA', 'Classe inválida.');
        return { avatar: sugerirAvatar(corpo, mundo) };
    }

    listar(sessao) {
        const usuario = this.autenticacao.conferir(sessao);
        return this.banco.listar('SELECT s.*, sc.campanha_id FROM salas s JOIN salas_campanhas sc ON sc.sala_id = s.id JOIN sala_membros sm ON sm.sala_id = s.id WHERE sm.usuario_id = ? ORDER BY s.id DESC', usuario.id).map(sala => this.apresentar(sala));
    }

    async carregar(id, sessao) {
        const sala = this.acessar(id, sessao);
        return { sala: this.apresentar(sala), campanha: await this.api.carregar(sala.campanha_id) };
    }

    async criar(corpo, sessao) {
        const usuario = this.autenticacao.conferir(sessao);
        validarCampos(corpo, ['titulo', 'historia', 'tom'], ['nome']);
        const nome = corpo.nome ?? corpo.titulo;
        if (typeof nome !== 'string' || nome.trim().length < 2 || nome.trim().length > 80) throw new ErroAplicacao(400, 'NOME_INVALIDO', 'Nome da sala inválido.');
        const mundo = await this.api.gerarMundo({ titulo: corpo.titulo, historia: corpo.historia, tom: corpo.tom });
        this.autenticacao.conferir(sessao);
        const id = this.api.repositorio.criarSala(mundo, usuario.id, nome.trim());
        return this.carregar(id, sessao);
    }

    entrar(corpo, sessao) {
        const usuario = this.autenticacao.conferir(sessao);
        validarCampos(corpo, ['codigo']);
        if (typeof corpo.codigo !== 'string' || !/^[A-Fa-f0-9]{16}$/.test(corpo.codigo.trim())) throw new ErroAplicacao(400, 'CODIGO_INVALIDO', 'Código de sala inválido.');
        let alterada = false;
        const salaId = this.banco.transacao(() => {
            const sala = this.banco.obter('SELECT s.id, s.etapa FROM salas s JOIN salas_campanhas sc ON sc.sala_id = s.id WHERE s.codigo = ? AND s.ativa = 1', corpo.codigo.trim().toUpperCase());
            if (!sala) throw new ErroAplicacao(404, 'SALA_NAO_ENCONTRADA', 'Sala não encontrada.');
            if (this.banco.obter('SELECT usuario_id FROM sala_membros WHERE sala_id = ? AND usuario_id = ?', sala.id, usuario.id)) return sala.id;
            if (sala.etapa !== 'preparacao') throw new ErroAplicacao(409, 'PARTIDA_JA_INICIADA', 'A entrada de novos jogadores está encerrada.');
            if (this.banco.obter('SELECT COUNT(*) AS quantidade FROM sala_membros WHERE sala_id = ?', sala.id).quantidade >= MAXIMO_JOGADORES) throw new ErroAplicacao(409, 'SALA_LOTADA', 'Sala com oito participantes.');
            this.banco.executar('INSERT INTO sala_membros(sala_id, usuario_id) VALUES (?, ?)', sala.id, usuario.id);
            this.banco.executar('UPDATE salas SET revisao_preparacao = revisao_preparacao + 1 WHERE id = ?', sala.id);
            alterada = true;
            return sala.id;
        });
        const sala = this.apresentar(this.acessar(salaId, sessao));
        if (alterada) this.emit('alterada', sala);
        return sala;
    }

    enfileirar(id, sessao, tarefa, opcoes = {}) {
        this.acessar(id, sessao, opcoes);
        const chave = Number(id);
        const operacao = (this.filas.get(chave) || Promise.resolve()).then(() => tarefa(this.acessar(id, sessao, opcoes)));
        const finalizada = operacao.catch(() => {});
        this.filas.set(chave, finalizada);
        finalizada.finally(() => { if (this.filas.get(chave) === finalizada) this.filas.delete(chave); });
        return operacao;
    }

    participante(sala, sessao, informado) {
        const vinculo = this.banco.obter('SELECT participante_id FROM fichas_campanha WHERE campanha_id = ? AND usuario_id = ?', sala.campanha_id, sessao.usuario.id);
        if (!vinculo) throw new ErroAplicacao(409, 'PERSONAGEM_NECESSARIO', 'Crie seu personagem nesta sala.');
        if (informado !== undefined && informado !== vinculo.participante_id) throw new ErroAplicacao(403, 'PERSONAGEM_DE_OUTRO_USUARIO', 'A ação só pode usar seu próprio personagem.');
        return vinculo.participante_id;
    }

    marcarPronto(id, corpo, sessao) {
        validarCampos(corpo, ['pronto']);
        if (typeof corpo.pronto !== 'boolean') throw new ErroAplicacao(400, 'PRONTIDAO_INVALIDA', 'Pronto deve ser verdadeiro ou falso.');
        const opcoes = { ativa: true, preparacao: true };
        return this.enfileirar(id, sessao, () => {
            const alterada = this.banco.transacao(() => {
                const sala = this.acessar(id, sessao, opcoes);
                if (corpo.pronto) this.participante(sala, sessao);
                const atualizacao = this.banco.executar('UPDATE sala_membros SET pronto = ? WHERE sala_id = ? AND usuario_id = ? AND pronto <> ?', Number(corpo.pronto), sala.id, sessao.usuario.id, Number(corpo.pronto));
                if (atualizacao.changes) this.banco.executar('UPDATE salas SET revisao_preparacao = revisao_preparacao + 1 WHERE id = ?', sala.id);
                return Boolean(atualizacao.changes);
            });
            const sala = this.apresentar(this.acessar(id, sessao));
            if (alterada) this.emit('alterada', sala);
            return sala;
        }, opcoes);
    }

    iniciar(id, corpo, sessao) {
        validarCampos(corpo, []);
        const opcoes = { ativa: true, anfitriao: true };
        return this.enfileirar(id, sessao, () => {
            const alterada = this.banco.transacao(() => {
                const sala = this.acessar(id, sessao, opcoes);
                if (sala.etapa === 'em_andamento') return false;
                const apresentada = this.apresentar(sala);
                if (apresentada.membros.length < MINIMO_JOGADORES) throw new ErroAplicacao(409, 'JOGADORES_INSUFICIENTES', 'A partida exige pelo menos dois jogadores.');
                if (!apresentada.preparacao.pronta_para_iniciar) throw new ErroAplicacao(409, 'JOGADORES_NAO_PRONTOS', 'Todos os jogadores precisam de uma ficha e devem confirmar que estão prontos.');
                const mundo = this.api.repositorio.prepararRegistro(this.api.repositorio.lerRegistro(sala.campanha_id));
                if (mundo.campanha.estado !== 'em_andamento' || mundo.campanha.turno !== 0 || mundo.campanha.pendente) throw new ErroAplicacao(409, 'CAMPANHA_INCOMPATIVEL', 'A campanha não está disponível para iniciar.');
                const ids = new Set(mundo.campanha.participantes.map(participante => participante.id));
                if (ids.size !== apresentada.membros.length || apresentada.membros.some(membro => !ids.has(membro.participante_id))) throw new ErroAplicacao(409, 'FICHAS_INCOMPATIVEIS', 'As fichas não correspondem aos jogadores da sala.');
                this.banco.executar("UPDATE salas SET etapa = 'em_andamento', iniciada_em = CURRENT_TIMESTAMP, revisao_preparacao = revisao_preparacao + 1 WHERE id = ?", sala.id);
                return true;
            });
            const sala = this.apresentar(this.acessar(id, sessao));
            if (alterada) this.emit('alterada', sala);
            return sala;
        }, opcoes);
    }

    criarFicha(id, corpo, sessao, importada = false) {
        if (importada) validarCampos(corpo, ['ficha'], ['participante_id']);
        else validarCampos(corpo, ['nome', 'classe_id', 'descricao_visual', 'habilidades_ids'], ['raca_id', 'avatar_id']);
        return this.enfileirar(id, sessao, sala => this.api.alterar(sala.campanha_id, async (condutor, mundo) => {
            const participanteId = `usuario_${sessao.usuario.id}`;
            if (corpo.participante_id !== undefined && corpo.participante_id !== participanteId) throw new ErroAplicacao(403, 'PERSONAGEM_DE_OUTRO_USUARIO', 'Identificador de personagem definido pelo servidor.');
            if (this.banco.obter('SELECT participante_id FROM fichas_campanha WHERE campanha_id = ? AND usuario_id = ?', sala.campanha_id, sessao.usuario.id)) throw new ErroAplicacao(409, 'PERSONAGEM_JA_VINCULADO', 'Você já possui um personagem nesta campanha.');
            let ficha;
            try { ficha = importada ? corpo.ficha : { ...criarPersonagem(corpo, mundo), mundo_hash: hashBaseCampanha(mundo) }; }
            catch { throw new ErroAplicacao(422, 'FICHA_INVALIDA', 'Dados da ficha inválidos.'); }
            let campanha;
            try { campanha = vincularParticipante(mundo.campanha, mundo, participanteId, ficha); }
            catch (erro) { throw new ErroAplicacao(422, 'VINCULO_INVALIDO', erro instanceof TypeError ? 'Ficha inválida.' : erro.message); }
            const vinculado = campanha.participantes.find(item => item.id === participanteId).ficha;
            const atualizado = this.api.repositorio.vincular(sala.campanha_id, campanha, sessao.usuario.id, participanteId, vinculado, mundo.revisaoPersistencia);
            this.emit('alterada', this.apresentar(this.acessar(id, sessao)));
            return apresentarCampanha(atualizado);
        }), { ativa: true, preparacao: true });
    }

    agir(id, corpo, sessao) {
        validarCampos(corpo, ['acao', 'turno_esperado'], ['participante_id']);
        return this.enfileirar(id, sessao, sala => this.api.agir(sala.campanha_id, { ...corpo, participante_id: this.participante(sala, sessao, corpo.participante_id) }), { ativa: true, iniciada: true });
    }

    repetir(id, corpo, sessao) { return this.pendente(id, corpo, sessao, 'repetir'); }
    descartar(id, corpo, sessao) { return this.pendente(id, corpo, sessao, 'descartar'); }

    pendente(id, corpo, sessao, operacao) {
        validarCampos(corpo, ['pedido_id'], ['participante_id']);
        return this.enfileirar(id, sessao, sala => this.api[operacao](sala.campanha_id, { ...corpo, participante_id: this.participante(sala, sessao, corpo.participante_id) }), { ativa: true, iniciada: true });
    }

    historico(id, consulta, sessao) { return this.api.historico(this.acessar(id, sessao).campanha_id, consulta); }

    encerrar(id, corpo, sessao) {
        validarCampos(corpo, []);
        return this.enfileirar(id, sessao, sala => {
            this.banco.executar('UPDATE salas SET ativa = 0, revisao_preparacao = revisao_preparacao + 1 WHERE id = ? AND ativa = 1', sala.id);
            const atualizada = this.apresentar(this.acessar(id, sessao));
            this.emit('alterada', atualizada);
            return atualizada;
        }, { anfitriao: true });
    }
}

module.exports = { Salas, validarSalaId };
