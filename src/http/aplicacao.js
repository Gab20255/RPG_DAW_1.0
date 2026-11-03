const express = require('express');
const { ApiCampanhas } = require('../services/apiCampanhasService');
const { ErroAplicacao } = require('../services/erroAplicacao');

function criarAplicacao({ api = new ApiCampanhas() } = {}) {
    const aplicacao = express();
    aplicacao.disable('x-powered-by');
    aplicacao.set('json escape', true);
    aplicacao.use((requisicao, resposta, proximo) => {
        resposta.set('Cache-Control', 'no-store');
        resposta.set('X-Content-Type-Options', 'nosniff');
        if (requisicao.method === 'POST' && !requisicao.is('application/json')) return proximo(new ErroAplicacao(415, 'FORMATO_INVALIDO', 'Envie o corpo como application/json.'));
        proximo();
    });
    aplicacao.use(express.json({ limit: '128kb', strict: true }));

    aplicacao.get('/', (requisicao, resposta) => resposta.json({ servico: 'RPG', estado: 'ativo' }));
    aplicacao.get('/api/saude', (requisicao, resposta) => resposta.json({ estado: 'ativo' }));
    aplicacao.get('/api/bases', (requisicao, resposta) => resposta.json({ bases: api.listarBases() }));
    aplicacao.get('/api/campanhas', async (requisicao, resposta) => resposta.json({ campanhas: await api.listar() }));
    aplicacao.post('/api/campanhas', async (requisicao, resposta) => {
        const campanha = await api.criar(requisicao.body);
        resposta.location(`/api/campanhas/${campanha.id}`).status(201).json({ campanha });
    });
    aplicacao.get('/api/campanhas/:id', async (requisicao, resposta) => resposta.json({ campanha: await api.carregar(requisicao.params.id) }));
    aplicacao.get('/api/campanhas/:id/historico', async (requisicao, resposta) => resposta.json(await api.historico(requisicao.params.id, requisicao.query)));
    aplicacao.post('/api/campanhas/:id/acoes', async (requisicao, resposta) => resposta.json({ campanha: await api.agir(requisicao.params.id, requisicao.body) }));
    aplicacao.post('/api/campanhas/:id/participantes', async (requisicao, resposta) => resposta.status(201).json({ campanha: await api.vincular(requisicao.params.id, requisicao.body) }));
    aplicacao.post('/api/campanhas/:id/repetir', async (requisicao, resposta) => resposta.json(await api.repetir(requisicao.params.id, requisicao.body)));
    aplicacao.post('/api/campanhas/:id/descartar', async (requisicao, resposta) => resposta.json({ campanha: await api.descartar(requisicao.params.id, requisicao.body) }));
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
