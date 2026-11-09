const express = require('express');
const caminhos = require('node:path');
const { ApiCampanhas } = require('../services/apiCampanhasService');
const { ErroAplicacao } = require('../services/erroAplicacao');
const { BancoDados } = require('../repositorios/bancoDados');
const { RepositorioCampanhasSqlite } = require('../repositorios/campanhasSqliteRepositorio');
const { Autenticacao, NOME_COOKIE, tokenDaRequisicao, validarCampos } = require('../services/autenticacaoService');
const { Salas } = require('../services/salasService');
const { origemPermitida, Limitador } = require('./seguranca');
const { obterImagemAvatar } = require('../services/avataresService');

function criarAplicacao({ banco, criarServico, rolar, autenticacao, limitador = new Limitador() } = {}) {
    const bancoAtual = banco || new BancoDados();
    const repositorio = new RepositorioCampanhasSqlite(bancoAtual);
    const api = new ApiCampanhas({ repositorio, criarServico, rolar });
    const auth = autenticacao || new Autenticacao(bancoAtual);
    const salas = new Salas({ banco: bancoAtual, autenticacao: auth, api });
    const aplicacao = express();
    aplicacao.locals.servicos = { banco: bancoAtual, autenticacao: auth, api, salas, limitador };
    let encerrada = false;
    aplicacao.locals.encerrar = () => { if (!encerrada && !banco) bancoAtual.fechar(); encerrada = true; };
    aplicacao.disable('x-powered-by');
    aplicacao.set('json escape', true);
    aplicacao.use((requisicao, resposta, proximo) => {
        resposta.set('Cache-Control', 'no-store');
        resposta.set('X-Content-Type-Options', 'nosniff');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(requisicao.method) && !origemPermitida(requisicao)) return proximo(new ErroAplicacao(403, 'ORIGEM_INVALIDA', 'Origem da requisição não permitida.'));
        if (requisicao.method === 'POST' && !requisicao.is('application/json')) return proximo(new ErroAplicacao(415, 'FORMATO_INVALIDO', 'Envie o corpo como application/json.'));
        proximo();
    });
    aplicacao.use(express.json({ limit: '128kb', strict: true }));

    aplicacao.use(express.static(caminhos.resolve(__dirname, '../../public'), { dotfiles: 'deny' }));
    aplicacao.get('/api/saude', (requisicao, resposta) => resposta.json({ estado: 'ativo' }));
    aplicacao.get('/api/bases', (requisicao, resposta) => resposta.json({ bases: api.listarBases() }));
    aplicacao.get('/avatares/v1/:id.svg', (requisicao, resposta) => {
        const imagem = obterImagemAvatar(requisicao.params.id);
        if (!imagem) throw new ErroAplicacao(404, 'AVATAR_NAO_ENCONTRADO', 'Avatar não encontrado.');
        resposta.set('Cache-Control', 'public, max-age=86400');
        resposta.set('Content-Security-Policy', "default-src 'none'; style-src 'none'; sandbox");
        resposta.type('image/svg+xml').send(imagem);
    });
    const limitarLogin = (requisicao, resposta, proximo) => {
        try { limitador.consumir(`autenticacao:${requisicao.ip}`, 20, 15 * 60 * 1000); proximo(); }
        catch (erro) { proximo(erro); }
    };
    const opcoesCookie = requisicao => ({ httpOnly: true, sameSite: 'lax', secure: requisicao.secure || process.env.NODE_ENV === 'production', path: '/' });
    aplicacao.post('/api/autenticacao/cadastro', limitarLogin, async (requisicao, resposta) => resposta.status(201).json({ usuario: await auth.cadastrar(requisicao.body) }));
    aplicacao.post('/api/autenticacao/login', limitarLogin, async (requisicao, resposta) => {
        const sessao = await auth.entrar(requisicao.body, tokenDaRequisicao(requisicao));
        resposta.cookie(NOME_COOKIE, sessao.token, { ...opcoesCookie(requisicao), maxAge: sessao.expira_em - auth.agora() });
        resposta.json({ usuario: sessao.usuario, expira_em: sessao.expira_em });
    });
    aplicacao.post('/api/autenticacao/logout', (requisicao, resposta) => {
        validarCampos(requisicao.body, []);
        auth.sair(tokenDaRequisicao(requisicao));
        resposta.clearCookie(NOME_COOKIE, opcoesCookie(requisicao)).status(204).end();
    });
    aplicacao.use('/api', (requisicao, resposta, proximo) => {
        try {
            requisicao.sessao = auth.autenticar(tokenDaRequisicao(requisicao));
            if (requisicao.method === 'POST') limitador.consumir(`acoes:${requisicao.sessao.usuario.id}`, 60, 60000);
            proximo();
        } catch (erro) { proximo(erro); }
    });
    aplicacao.get('/api/autenticacao/sessao', (requisicao, resposta) => resposta.json({ usuario: requisicao.sessao.usuario, expira_em: requisicao.sessao.expira_em }));
    aplicacao.get('/api/salas', (requisicao, resposta) => resposta.json({ salas: salas.listar(requisicao.sessao) }));
    const limitarCriacao = (requisicao, resposta, proximo) => {
        try { limitador.consumir(`criacao:${requisicao.sessao.usuario.id}`, 5, 60000); proximo(); }
        catch (erro) { proximo(erro); }
    };
    aplicacao.post('/api/salas', limitarCriacao, async (requisicao, resposta) => {
        const criada = await salas.criar(requisicao.body, requisicao.sessao);
        resposta.location(`/api/salas/${criada.sala.id}`).status(201).json(criada);
    });
    aplicacao.post('/api/salas/entrar', (requisicao, resposta) => resposta.json({ sala: salas.entrar(requisicao.body, requisicao.sessao) }));
    aplicacao.get('/api/salas/:id', async (requisicao, resposta) => resposta.json(await salas.carregar(requisicao.params.id, requisicao.sessao)));
    aplicacao.get('/api/salas/:id/catalogo', async (requisicao, resposta) => resposta.json(await salas.catalogo(requisicao.params.id, requisicao.query, requisicao.sessao)));
    aplicacao.post('/api/salas/:id/avatar/previa', async (requisicao, resposta) => resposta.json(await salas.preverAvatar(requisicao.params.id, requisicao.body, requisicao.sessao)));
    aplicacao.post('/api/salas/:id/personagem', async (requisicao, resposta) => resposta.status(201).json({ campanha: await salas.criarFicha(requisicao.params.id, requisicao.body, requisicao.sessao) }));
    aplicacao.post('/api/salas/:id/pronto', async (requisicao, resposta) => resposta.json({ sala: await salas.marcarPronto(requisicao.params.id, requisicao.body, requisicao.sessao) }));
    aplicacao.post('/api/salas/:id/iniciar', async (requisicao, resposta) => resposta.json({ sala: await salas.iniciar(requisicao.params.id, requisicao.body, requisicao.sessao) }));
    aplicacao.post('/api/salas/:id/acoes', async (requisicao, resposta) => resposta.json({ campanha: await salas.agir(requisicao.params.id, requisicao.body, requisicao.sessao) }));
    aplicacao.post('/api/salas/:id/repetir', async (requisicao, resposta) => resposta.json(await salas.repetir(requisicao.params.id, requisicao.body, requisicao.sessao)));
    aplicacao.post('/api/salas/:id/descartar', async (requisicao, resposta) => resposta.json({ campanha: await salas.descartar(requisicao.params.id, requisicao.body, requisicao.sessao) }));
    aplicacao.get('/api/salas/:id/historico', async (requisicao, resposta) => resposta.json(await salas.historico(requisicao.params.id, requisicao.query, requisicao.sessao)));
    aplicacao.post('/api/salas/:id/encerrar', async (requisicao, resposta) => resposta.json({ sala: await salas.encerrar(requisicao.params.id, requisicao.body, requisicao.sessao) }));

    const idSala = requisicao => salas.salaDaCampanha(requisicao.params.id, requisicao.sessao);
    aplicacao.get('/api/campanhas', async (requisicao, resposta) => {
        const campanhas = await Promise.all(salas.listar(requisicao.sessao).map(sala => api.carregar(sala.campanha_id)));
        resposta.json({ campanhas });
    });
    aplicacao.post('/api/campanhas', async (requisicao, resposta) => {
        limitador.consumir(`criacao:${requisicao.sessao.usuario.id}`, 5, 60000);
        const { campanha, sala } = await salas.criar(requisicao.body, requisicao.sessao);
        resposta.location(`/api/campanhas/${campanha.id}`).status(201).json({ campanha, sala });
    });
    aplicacao.get('/api/campanhas/:id', async (requisicao, resposta) => resposta.json({ campanha: (await salas.carregar(idSala(requisicao), requisicao.sessao)).campanha }));
    aplicacao.get('/api/campanhas/:id/historico', async (requisicao, resposta) => resposta.json(await salas.historico(idSala(requisicao), requisicao.query, requisicao.sessao)));
    aplicacao.post('/api/campanhas/:id/acoes', async (requisicao, resposta) => resposta.json({ campanha: await salas.agir(idSala(requisicao), requisicao.body, requisicao.sessao) }));
    aplicacao.post('/api/campanhas/:id/participantes', async (requisicao, resposta) => resposta.status(201).json({ campanha: await salas.criarFicha(idSala(requisicao), requisicao.body, requisicao.sessao, true) }));
    aplicacao.post('/api/campanhas/:id/repetir', async (requisicao, resposta) => resposta.json(await salas.repetir(idSala(requisicao), requisicao.body, requisicao.sessao)));
    aplicacao.post('/api/campanhas/:id/descartar', async (requisicao, resposta) => resposta.json({ campanha: await salas.descartar(idSala(requisicao), requisicao.body, requisicao.sessao) }));
    aplicacao.use((requisicao, resposta) => resposta.status(404).json({ erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' } }));
    aplicacao.use((erro, requisicao, resposta, proximo) => {
        if (resposta.headersSent) return proximo(erro);
        let publico = erro;
        if (erro.type === 'entity.too.large') publico = new ErroAplicacao(413, 'CORPO_MUITO_GRANDE', 'A requisição excede 128 KB.');
        else if (erro.type === 'entity.parse.failed' || erro instanceof URIError) publico = new ErroAplicacao(400, 'JSON_OU_URL_INVALIDO', 'JSON ou endereço inválido.');
        else if (erro.type === 'encoding.unsupported' || erro.type === 'charset.unsupported') publico = new ErroAplicacao(415, 'CODIFICACAO_INVALIDA', 'Codificação não suportada.');
        else if (!(erro instanceof ErroAplicacao)) publico = new ErroAplicacao(500, 'FALHA_INTERNA', 'Não foi possível concluir a operação.');
        resposta.status(publico.status).json({ erro: { codigo: publico.codigo, mensagem: publico.message, ...(publico.detalhes ? { detalhes: publico.detalhes } : {}) } });
    });
    return aplicacao;
}

module.exports = { criarAplicacao };
