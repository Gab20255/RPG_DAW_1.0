const arquivos = require('node:fs/promises');
const caminhos = require('node:path');
const { createHash: criarHash } = require('node:crypto');
const { RAIZ, lerJson, salvarNovo, salvarAtomico } = require('../terminal/arquivos');
const { validarMundo } = require('../prompts/mundoPrompt');
const { iniciarCampanha, migrarCampanha, validarCampanha } = require('../services/campanhaService');
const { ErroAplicacao } = require('../services/erroAplicacao');

function validarIdCampanha(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new ErroAplicacao(400, 'ID_INVALIDO', 'Identificador de campanha inválido.');
}

class RepositorioCampanhas {
    constructor(pasta = caminhos.join(RAIZ, 'output/mundos')) {
        this.pasta = caminhos.resolve(pasta);
    }

    async listar() {
        let entradas;
        try { entradas = await arquivos.readdir(this.pasta, { withFileTypes: true }); }
        catch (erro) { if (erro.code === 'ENOENT') return []; throw erro; }
        const campanhas = [];
        const ids = new Set();
        for (const entrada of entradas.filter(item => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
            const arquivo = caminhos.join(this.pasta, entrada.name);
            let mundo;
            try {
                mundo = validarMundo(await lerJson(arquivo, 10 * 1024 * 1024));
                if (!mundo.campanha) {
                    if (!['historia_inicial', 'campanha_em_andamento', 'campanha_concluida'].includes(mundo.preparacao?.etapa)) continue;
                    mundo.campanha = iniciarCampanha(mundo);
                    mundo.campanha.id = `legado_${criarHash('sha256').update(entrada.name).digest('hex').slice(0, 24)}`;
                }
                mundo.campanha = migrarCampanha(mundo.campanha, mundo);
            } catch (erro) {
                if (erro.code && !['ENOENT', 'ERR_INVALID_ARG_TYPE'].includes(erro.code)) throw erro;
                continue;
            }
            if (ids.has(mundo.campanha.id)) throw new ErroAplicacao(409, 'CAMPANHA_DUPLICADA', 'Há arquivos com o mesmo identificador de campanha.');
            ids.add(mundo.campanha.id);
            campanhas.push({ arquivo, mundo });
        }
        return campanhas;
    }

    async carregar(id) {
        validarIdCampanha(id);
        const encontrada = (await this.listar()).find(item => item.mundo.campanha.id === id);
        if (!encontrada) throw new ErroAplicacao(404, 'CAMPANHA_NAO_ENCONTRADA', 'Campanha não encontrada.');
        return encontrada.mundo;
    }

    async criar(mundo) {
        validarMundo(mundo);
        validarCampanha(mundo.campanha, mundo);
        if ((await this.listar()).some(item => item.mundo.campanha.id === mundo.campanha.id)) throw new ErroAplicacao(409, 'CAMPANHA_DUPLICADA', 'Identificador de campanha já utilizado.');
        await salvarNovo(this.pasta, 'mundo-base', mundo);
        return structuredClone(mundo);
    }

    async salvar(id, campanha) {
        validarIdCampanha(id);
        const encontrada = (await this.listar()).find(item => item.mundo.campanha.id === id);
        if (!encontrada) throw new ErroAplicacao(404, 'CAMPANHA_NAO_ENCONTRADA', 'Campanha não encontrada.');
        if (campanha.id !== id) throw new ErroAplicacao(409, 'CAMPANHA_INCOMPATIVEL', 'O estado pertence a outra campanha.');
        const mundo = structuredClone(encontrada.mundo);
        mundo.campanha = structuredClone(validarCampanha(campanha, mundo));
        mundo.preparacao ||= { proxima_etapa: 'participantes', adaptacao: 'importada', motivo_local: null };
        mundo.preparacao.etapa = campanha.estado === 'concluida' ? 'campanha_concluida' : campanha.turno ? 'campanha_em_andamento' : 'historia_inicial';
        await salvarAtomico(encontrada.arquivo, mundo);
        return mundo;
    }
}

module.exports = { RepositorioCampanhas, validarIdCampanha };
