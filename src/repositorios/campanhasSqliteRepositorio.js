const { EventEmitter: EmissorEventos } = require('node:events');
const { randomBytes: bytesAleatorios } = require('node:crypto');
const { validarIdCampanha } = require('./campanhasRepositorio');
const { validarMundo } = require('../prompts/mundoPrompt');
const { migrarCampanha, validarCampanha, obterMundoCampanha } = require('../services/campanhaService');
const { prepararEstadoMecanico, idJogador } = require('../services/combateService');
const { selecionarCenario } = require('../services/cenariosService');
const { ErroAplicacao } = require('../services/erroAplicacao');

class RepositorioCampanhasSqlite extends EmissorEventos {
    constructor(banco) { super(); this.banco = banco; }

    lerRegistro(id) {
        validarIdCampanha(id);
        const registro = this.banco.obter('SELECT c.*, sc.sala_id FROM campanhas c JOIN salas_campanhas sc ON sc.campanha_id = c.id WHERE c.id = ?', id);
        if (!registro) throw new ErroAplicacao(404, 'CAMPANHA_NAO_ENCONTRADA', 'Campanha não encontrada.');
        return registro;
    }

    prepararRegistro(registro) {
        const mundo = validarMundo(JSON.parse(registro.mundo_json));
        mundo.campanha = migrarCampanha(mundo.campanha, mundo);
        return this.anexarMetadados(mundo, registro.revisao);
    }

    async carregar(id) { return this.prepararRegistro(this.lerRegistro(id)); }

    async listar() { return this.banco.listar('SELECT * FROM campanhas ORDER BY criada_em DESC').map(registro => ({ mundo: this.prepararRegistro(registro) })); }

    definirImagemCenario(mundo, ambiente, mapa) {
        if (mapa.imagem_url !== null) return mapa.imagem_url;
        const { url } = selecionarCenario({ tema: mundo.origem?.base_id, ambiente });
        const alterado = this.banco.obter(`UPDATE mapas_cenarios SET imagem_url = ?
            WHERE id = ? AND imagem_url IS NULL RETURNING imagem_url`, url, mapa.mapa_id);
        return alterado?.imagem_url ?? this.banco.obter('SELECT imagem_url FROM mapas_cenarios WHERE id = ?', mapa.mapa_id)?.imagem_url ?? null;
    }

    anexarMetadados(mundo, revisao) {
        const campanha = mundo.campanha;
        const mapas = this.banco.listar(`SELECT a.ambiente_id, a.mapa_id, m.imagem_url
            FROM ambientes_mapas a JOIN mapas_cenarios m ON m.id = a.mapa_id WHERE a.campanha_id = ?`, campanha.id);
        const mapaAtual = mapas.find(mapa => mapa.ambiente_id === campanha.ambiente_id);
        if (mapaAtual?.imagem_url === null) {
            const ambienteAtual = [...mundo.ambientes, ...campanha.conteudo.ambientes].find(ambiente => ambiente.id === campanha.ambiente_id);
            mapaAtual.imagem_url = this.definirImagemCenario(mundo, ambienteAtual, mapaAtual);
        }
        Object.defineProperties(mundo, {
            revisaoPersistencia: { value: revisao },
            imagensCenarios: { value: new Map(mapas.map(mapa => [mapa.ambiente_id, mapa.imagem_url])) },
        });
        return mundo;
    }

    criarSala(mundo, usuarioId, nome) {
        validarMundo(mundo); validarCampanha(mundo.campanha, mundo);
        const id = mundo.campanha.id;
        const salaId = this.banco.transacao(() => {
            this.banco.executar('INSERT INTO campanhas(id, dono_id, mundo_json) VALUES (?, ?, ?)', id, usuarioId, JSON.stringify(mundo));
            const codigo = bytesAleatorios(8).toString('hex').toUpperCase();
            const sala = this.banco.executar('INSERT INTO salas(nome, tema, codigo, host_id, lore, objetivo) VALUES (?, ?, ?, ?, ?, ?)', nome, mundo.mundo.tema, codigo, usuarioId, mundo.historia.preludio, mundo.campanha.direcao.objetivo);
            const salaId = Number(sala.lastInsertRowid);
            this.banco.executar('INSERT INTO salas_campanhas(sala_id, campanha_id) VALUES (?, ?)', salaId, id);
            this.banco.executar('INSERT INTO sala_membros(sala_id, usuario_id) VALUES (?, ?)', salaId, usuarioId);
            this.sincronizar(mundo, salaId);
            return salaId;
        });
        return salaId;
    }

    sincronizar(mundo, salaId) {
        const campanha = mundo.campanha, atual = obterMundoCampanha(mundo, campanha);
        const mecanica = prepararEstadoMecanico(campanha, atual);
        this.banco.executar('UPDATE salas SET objetivo = ? WHERE id = ?', campanha.direcao.objetivo, salaId);
        for (const [ordem, ambiente] of atual.ambientes.entries()) {
            const ativo = ambiente.id === campanha.ambiente_id;
            let vinculo = this.banco.obter(`SELECT a.mapa_id, m.imagem_url FROM ambientes_mapas a
                JOIN mapas_cenarios m ON m.id = a.mapa_id WHERE a.campanha_id = ? AND a.ambiente_id = ?`, campanha.id, ambiente.id);
            if (!vinculo) {
                const mapa = this.banco.executar('INSERT INTO mapas_cenarios(sala_id, nome, descricao, ordem, mapa_atual) VALUES (?, ?, ?, ?, ?)', salaId, ambiente.nome, ambiente.descricao, ordem, Number(ativo));
                vinculo = { mapa_id: Number(mapa.lastInsertRowid), imagem_url: null };
                this.banco.executar('INSERT INTO ambientes_mapas(campanha_id, ambiente_id, mapa_id) VALUES (?, ?, ?)', campanha.id, ambiente.id, vinculo.mapa_id);
            } else {
                this.banco.executar('UPDATE mapas_cenarios SET nome = ?, descricao = ?, mapa_atual = ? WHERE id = ?', ambiente.nome, ambiente.descricao, Number(ativo), vinculo.mapa_id);
            }
            if (ativo) this.definirImagemCenario(mundo, ambiente, vinculo);
        }
        for (const participante of campanha.participantes) {
            const vinculo = this.banco.obter('SELECT personagem_id FROM fichas_campanha WHERE campanha_id = ? AND participante_id = ?', campanha.id, participante.id);
            if (!vinculo) throw new Error('Participante sem proprietário no banco.');
            const estado = mecanica.combatentes.find(item => item.id === idJogador(participante.id));
            this.banco.executar('UPDATE personagens SET vida = ?, vida_max = ?, inventario = ?, avatar_url = ? WHERE id = ?', estado.vida, estado.vida_max, JSON.stringify(participante.ficha.inventario), participante.ficha.avatar_url ?? null, vinculo.personagem_id);
        }
        for (const cena of campanha.diario) {
            if (this.banco.obter('SELECT cena_id FROM cenas_mensagens WHERE campanha_id = ? AND cena_id = ?', campanha.id, cena.id)) continue;
            const autor = cena.participante_id ? this.banco.obter('SELECT usuario_id, personagem_id FROM fichas_campanha WHERE campanha_id = ? AND participante_id = ?', campanha.id, cena.participante_id) : null;
            const acao = this.banco.executar('INSERT INTO mensagens(sala_id, usuario_id, personagem_id, tipo, conteudo) VALUES (?, ?, ?, ?, ?)', salaId, autor?.usuario_id ?? null, autor?.personagem_id ?? null, 'acao', cena.acao);
            const narracao = this.banco.executar('INSERT INTO mensagens(sala_id, tipo, conteudo) VALUES (?, ?, ?)', salaId, 'mestre', cena.narracao);
            this.banco.executar('INSERT INTO cenas_mensagens(campanha_id, cena_id, acao_id, narracao_id) VALUES (?, ?, ?, ?)', campanha.id, cena.id, Number(acao.lastInsertRowid), Number(narracao.lastInsertRowid));
        }
    }

    salvarEstado(id, campanha, revisao, antesSalvar = () => {}) {
        const registro = this.lerRegistro(id);
        const mundo = JSON.parse(registro.mundo_json);
        mundo.campanha = structuredClone(validarCampanha(campanha, mundo));
        if (campanha.id !== id) throw new ErroAplicacao(409, 'CAMPANHA_INCOMPATIVEL', 'Campanha incompatível.');
        mundo.preparacao ||= {};
        mundo.preparacao.etapa = campanha.estado === 'concluida' ? 'campanha_concluida' : campanha.turno ? 'campanha_em_andamento' : 'historia_inicial';
        this.banco.transacao(() => {
            const alterado = this.banco.executar('UPDATE campanhas SET mundo_json = ?, revisao = revisao + 1, atualizada_em = CURRENT_TIMESTAMP WHERE id = ? AND revisao = ?', JSON.stringify(mundo), id, revisao ?? registro.revisao);
            if (!alterado.changes) throw new ErroAplicacao(409, 'CAMPANHA_ALTERADA', 'A campanha foi atualizada por outra operação. Recarregue o estado.');
            antesSalvar(registro.sala_id);
            this.sincronizar(mundo, registro.sala_id);
        });
        this.anexarMetadados(mundo, registro.revisao + 1);
        this.emit('alterada', { sala_id: registro.sala_id, mundo });
        return mundo;
    }

    obterPedidoAcao(id, cenaId) {
        return this.banco.obter('SELECT participante_id, turno, acao FROM pedidos_acoes WHERE campanha_id = ? AND cena_id = ?', id, cenaId);
    }

    async salvar(id, campanha, { revisao, cenaId } = {}) {
        return this.salvarEstado(id, campanha, revisao, () => {
            if (!cenaId) return;
            const { participante_id, turno, acao } = campanha.pendente;
            this.banco.executar('INSERT INTO pedidos_acoes(campanha_id, cena_id, participante_id, turno, acao) VALUES (?, ?, ?, ?, ?)', id, cenaId, participante_id, turno, acao);
        });
    }

    vincular(id, campanha, usuarioId, participanteId, ficha, revisao) {
        return this.salvarEstado(id, campanha, revisao, salaId => {
            const sala = this.banco.obter('SELECT ativa, etapa FROM salas WHERE id = ?', salaId);
            if (!sala?.ativa) throw new ErroAplicacao(409, 'SALA_ENCERRADA', 'Sala encerrada.');
            if (sala.etapa !== 'preparacao') throw new ErroAplicacao(409, 'PARTIDA_JA_INICIADA', 'A preparação da sala já terminou.');
            if (!this.banco.obter('SELECT usuario_id FROM sala_membros WHERE sala_id = ? AND usuario_id = ?', salaId, usuarioId)) throw new ErroAplicacao(403, 'ACESSO_NEGADO', 'Usuário não pertence à sala.');
            const atributos = ficha.atributos;
            const registro = this.banco.executar('INSERT INTO personagens(usuario_id, nome, classe, nivel, vida, vida_max, forca, destreza, inteligencia, carisma, constituicao, sabedoria, descricao_visual, avatar_url, inventario) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', usuarioId, ficha.nome, ficha.classe, ficha.nivel, ficha.vida, ficha.vida_max, atributos.forca, atributos.destreza, atributos.inteligencia, atributos.carisma, atributos.constituicao, atributos.sabedoria, ficha.descricao_visual, ficha.avatar_url, JSON.stringify(ficha.inventario));
            const personagemId = Number(registro.lastInsertRowid);
            this.banco.executar('INSERT INTO fichas_campanha(campanha_id, usuario_id, personagem_id, participante_id) VALUES (?, ?, ?, ?)', id, usuarioId, personagemId, participanteId);
            this.banco.executar('INSERT INTO sala_jogadores(sala_id, personagem_id) VALUES (?, ?)', salaId, personagemId);
            this.banco.executar('UPDATE sala_membros SET pronto = 0 WHERE sala_id = ? AND usuario_id = ?', salaId, usuarioId);
            this.banco.executar('UPDATE salas SET revisao_preparacao = revisao_preparacao + 1 WHERE id = ?', salaId);
        });
    }
}

module.exports = { RepositorioCampanhasSqlite };
