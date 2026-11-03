const { Server: ServidorSocket } = require('socket.io');
const { tokenDaRequisicao, validarCampos } = require('../services/autenticacaoService');
const { origemPermitida } = require('./seguranca');
const { ErroAplicacao } = require('../services/erroAplicacao');
const { apresentarCampanha } = require('./apresentacaoCampanha');

function erroPublico(erro) {
    return erro instanceof ErroAplicacao ? { codigo: erro.codigo, mensagem: erro.message, ...(erro.detalhes ? { detalhes: erro.detalhes } : {}) }
        : { codigo: 'FALHA_INTERNA', mensagem: 'Não foi possível concluir a operação.' };
}

function conectarTempoReal(servidor, { autenticacao, salas, api, limitador }) {
    const io = new ServidorSocket(servidor, { maxHttpBufferSize: 128 * 1024, allowRequest: (requisicao, responder) => responder(null, origemPermitida(requisicao)) });
    const canal = id => `sala:${id}`;
    io.use((socket, proximo) => {
        try {
            if (!origemPermitida(socket.request)) throw new ErroAplicacao(403, 'ORIGEM_INVALIDA', 'Origem não permitida.');
            socket.data.sessao = autenticacao.autenticar(tokenDaRequisicao(socket.request));
            proximo();
        } catch (erro) { const publico = erroPublico(erro); const falha = new Error(publico.mensagem); falha.data = publico; proximo(falha); }
    });

    function publicar(salaId, evento, conteudo) {
        for (const socket of io.sockets.sockets.values()) {
            if (!socket.rooms.has(canal(salaId))) continue;
            try { salas.acessar(salaId, socket.data.sessao); socket.emit(evento, conteudo); }
            catch { socket.leave(canal(salaId)); }
        }
    }

    const campanhaAlterada = ({ sala_id, mundo }) => publicar(sala_id, 'campanha:atualizada', { sala_id, campanha: apresentarCampanha(mundo) });
    const salaAlterada = sala => publicar(sala.id, 'sala:atualizada', { sala });
    const revogada = hash => {
        for (const socket of io.sockets.sockets.values()) if (socket.data.sessao.token_hash === hash) { socket.emit('sessao:encerrada'); socket.disconnect(true); }
    };
    api.repositorio.on('alterada', campanhaAlterada);
    salas.on('alterada', salaAlterada);
    autenticacao.on('revogada', revogada);

    io.on('connection', socket => {
        const expirar = setTimeout(() => { socket.emit('sessao:encerrada'); socket.disconnect(true); }, Math.max(0, socket.data.sessao.expira_em - autenticacao.agora()));
        expirar.unref();
        socket.on('disconnect', () => clearTimeout(expirar));
        const registrar = (evento, tarefa) => socket.on(evento, async (corpo, responder) => {
            const resposta = typeof responder === 'function' ? responder : () => {};
            try {
                autenticacao.conferir(socket.data.sessao);
                limitador.consumir(`socket:${socket.data.sessao.usuario.id}`, 60, 60000);
                const dados = await tarefa(corpo);
                resposta({ ok: true, ...dados });
            } catch (erro) {
                resposta({ ok: false, erro: erroPublico(erro) });
                if (erro.status === 401) socket.disconnect(true);
            }
        });
        registrar('sala:acompanhar', async corpo => {
            validarCampos(corpo, ['sala_id']);
            const sala = salas.acessar(corpo.sala_id, socket.data.sessao);
            await socket.join(canal(sala.id));
            return salas.carregar(sala.id, socket.data.sessao);
        });
        registrar('sala:parar', async corpo => { validarCampos(corpo, ['sala_id']); const sala = salas.acessar(corpo.sala_id, socket.data.sessao); await socket.leave(canal(sala.id)); return {}; });
        for (const [evento, metodo, campos] of [['sala:acao', 'agir', ['acao', 'turno_esperado']], ['sala:repetir', 'repetir', ['pedido_id']], ['sala:descartar', 'descartar', ['pedido_id']]]) {
            registrar(evento, async corpo => {
                validarCampos(corpo, ['sala_id', ...campos], ['participante_id']);
                const { sala_id, ...pedido } = corpo;
                const resultado = await salas[metodo](sala_id, pedido, socket.data.sessao);
                return metodo === 'repetir' ? resultado : { campanha: resultado };
            });
        }
    });

    servidor.once('close', () => {
        api.repositorio.off('alterada', campanhaAlterada);
        salas.off('alterada', salaAlterada);
        autenticacao.off('revogada', revogada);
    });
    return io;
}

module.exports = { conectarTempoReal };
