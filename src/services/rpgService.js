const arquivos = require('node:fs/promises');
const caminhos = require('node:path');
const { randomUUID: criarIdentificador } = require('node:crypto');
const { isDeepStrictEqual: saoIguais } = require('node:util');
const { RAIZ, hashMundo, lerJson, salvarAtomico } = require('../terminal/arquivos');
const { validarMundo } = require('../prompts/mundoPrompt');
const { validarNarracao } = require('../prompts/mestrePrompt');
const { criarPersonagem } = require('./personagemService');
const { criarPartida } = require('./partidaService');

function reconstruirFicha(ficha, mundo, alteracoes = {}) {
    const pedido = {
        mundo_id: ficha.mundo_id, nome: ficha.nome, classe_id: ficha.classe_id,
        raca_id: ficha.raca_id, descricao_visual: ficha.descricao_visual,
        habilidades_ids: ficha.habilidades.map((habilidade) => habilidade.id), ...alteracoes,
    };
    return {
        ...criarPersonagem(pedido, mundo), id: ficha.id, criado_em: ficha.criado_em,
        mundo_hash: hashMundo(mundo), mundo_arquivo: ficha.mundo_arquivo,
    };
}

function criarRpg(nome, mundo, ficha) {
    if (typeof nome !== 'string' || nome.trim().length < 2 || nome.trim().length > 80) throw new Error('O nome do RPG deve ter de 2 a 80 caracteres.');
    validarMundo(mundo);
    const data = new Date().toISOString();
    return {
        versao: '1.0', edicao: 1, id: criarIdentificador(), nome: nome.trim(), criado_em: data,
        atualizado_em: data, mundo: structuredClone(mundo), estado: criarPartida(ficha, mundo), edicoes: [],
    };
}

function validarRpg(rpg) {
    if (!rpg || rpg.versao !== '1.0' || !/^[a-zA-Z0-9_-]{1,80}$/.test(rpg.id || '')) throw new Error('Arquivo de RPG inválido.');
    if (typeof rpg.nome !== 'string' || !rpg.nome.trim() || rpg.nome.length > 80) throw new Error('Nome do RPG inválido.');
    validarMundo(rpg.mundo);
    const inicial = criarPartida(rpg.estado?.personagem, rpg.mundo);
    if (rpg.estado.versao !== inicial.versao || rpg.estado.mundo_hash !== inicial.mundo_hash || !saoIguais(rpg.estado.personagem, inicial.personagem)) throw new Error('A ficha ou as regras do RPG foram alteradas de forma incompatível.');
    if (!rpg.mundo.ambientes.some((ambiente) => ambiente.id === rpg.estado.ambiente_id) || !Array.isArray(rpg.estado.eventos)) throw new Error('Estado da partida inválido.');
    const identificadores = new Set();
    for (const evento of rpg.estado.eventos) {
        if (!evento || typeof evento.id !== 'string' || identificadores.has(evento.id) || evento.personagem_id !== inicial.personagem.id || !rpg.mundo.ambientes.some((ambiente) => ambiente.id === evento.ambiente_id)) throw new Error('Histórico do RPG incompatível com a ficha ou os ambientes.');
        identificadores.add(evento.id);
        if (evento.narracao) validarNarracao(evento.narracao, { resultado: evento, personagem: inicial.personagem, cena: { id: evento.ambiente_id } });
    }
    return rpg;
}

function editarIdentidade(rpg, { nome, nomePersonagem, descricaoVisual } = {}) {
    const atualizado = structuredClone(rpg);
    if (nome !== undefined) {
        if (typeof nome !== 'string' || nome.trim().length < 2 || nome.trim().length > 80) throw new Error('Nome inválido (2–80 caracteres).');
        atualizado.nome = nome.trim();
    }
    if (nomePersonagem !== undefined || descricaoVisual !== undefined) {
        atualizado.estado.personagem = reconstruirFicha(atualizado.estado.personagem, atualizado.mundo, {
            nome: nomePersonagem ?? atualizado.estado.personagem.nome,
            descricao_visual: descricaoVisual ?? atualizado.estado.personagem.descricao_visual,
        });
    }
    atualizado.edicoes ||= [];
    atualizado.edicoes.push({ data: new Date().toISOString(), tipo: 'identidade' });
    return validarRpg(atualizado);
}

function criarVersao(rpg, mundo, ficha = reconstruirFicha(rpg.estado.personagem, mundo)) {
    const versao = criarRpg(rpg.nome, mundo, ficha);
    versao.edicao = (rpg.edicao || 1) + 1;
    versao.origem_rpg_id = rpg.id;
    versao.edicoes.push({ data: versao.criado_em, tipo: 'nova_versao', origem: rpg.id });
    return versao;
}

class RepositorioRpg {
    constructor(pasta = caminhos.join(RAIZ, 'output/rpgs')) { this.pasta = caminhos.resolve(pasta); }

    async listar() {
        let nomes;
        try { nomes = await arquivos.readdir(this.pasta); }
        catch (erro) { if (erro.code === 'ENOENT') return []; throw erro; }
        const salvos = [];
        for (const nome of nomes.filter((nome) => nome.endsWith('.json'))) {
            try {
                const rpg = await this.carregar(caminhos.join(this.pasta, nome));
                salvos.push(rpg);
            } catch {}
        }
        return salvos.sort((primeiro, segundo) => String(segundo.atualizado_em).localeCompare(String(primeiro.atualizado_em)));
    }

    async carregar(arquivo) { return validarRpg(await lerJson(caminhos.resolve(arquivo), 10 * 1024 * 1024)); }

    async salvar(rpg) {
        const atualizado = structuredClone(validarRpg(rpg));
        atualizado.atualizado_em = new Date().toISOString();
        await salvarAtomico(caminhos.join(this.pasta, `rpg-${atualizado.id}.json`), atualizado);
        return atualizado;
    }
}

module.exports = { RepositorioRpg, criarRpg, validarRpg, editarIdentidade, criarVersao, reconstruirFicha };
