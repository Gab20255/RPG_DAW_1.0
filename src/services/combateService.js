const { randomInt: sortearInteiro } = require('node:crypto');
const { isDeepStrictEqual: saoIguais } = require('node:util');
const { PERFIS_AMEACA, TIPOS_ACAO, LIMITE_POSICAO, validarEstadoMecanico } = require('../rules/combate');
const { conferirCampos } = require('../rules/narrativa');

function iniciarMecanica() { return { versao: '1.0', combatentes: [], encontro: null }; }
function bonus(atributo) { return Math.floor((atributo - 10) / 2); }
function idJogador(id) { return `jogador_${id}`; }

function criarCombatente(origem, tipo, ambienteId) {
    const ficha = tipo === 'jogador' ? origem.ficha : null;
    const perfil = ficha ? { vida: ficha.vida_max, defesa: 10 + bonus(ficha.atributos.destreza), ataque: bonus(ficha.atributos.forca), dano: 10 } : PERFIS_AMEACA[origem.ameaca] || PERFIS_AMEACA.baixa;
    return {
        id: tipo === 'jogador' ? idJogador(origem.id) : `${tipo}_${origem.id}`, origem_id: origem.id, tipo,
        nome: ficha?.nome || origem.nome, ambiente_id: ambienteId,
        vida: perfil.vida, vida_max: perfil.vida, energia: ficha?.energia_max || 0, energia_max: ficha?.energia_max || 0,
        defesa: perfil.defesa, ataque: perfil.ataque, dano: perfil.dano, posicao: ficha ? 0 : tipo === 'npc' ? 2 : 6,
        turnos: 0, recargas: [], efeitos: [], preparacao: null,
    };
}

function prepararEstadoMecanico(campanha, mundo) {
    const estado = structuredClone(campanha.mecanica || iniciarMecanica());
    for (const participante of campanha.participantes || []) {
        let ator = estado.combatentes.find(item => item.id === idJogador(participante.id));
        if (!ator) { ator = criarCombatente(participante, 'jogador', campanha.ambiente_id); estado.combatentes.push(ator); }
        if (ator.ambiente_id !== campanha.ambiente_id && estado.encontro?.estado !== 'ativo') {
            ator.ambiente_id = campanha.ambiente_id; ator.posicao = 0;
        }
    }
    for (const [tipo, origens] of [['npc', mundo.personagens.filter(item => item.ambiente_id === campanha.ambiente_id)], ['criatura', mundo.criaturas.filter(item => item.ambientes_ids.includes(campanha.ambiente_id))]]) {
        for (const origem of origens) if (!estado.combatentes.some(item => item.id === `${tipo}_${origem.id}`)) estado.combatentes.push(criarCombatente(origem, tipo, campanha.ambiente_id));
    }
    if (estado.encontro && estado.encontro.ambiente_id !== campanha.ambiente_id && estado.encontro.estado !== 'ativo') estado.encontro = null;
    return validarEstadoMecanico(estado);
}

function conferirOrigens(estado, campanha, mundo) {
    validarEstadoMecanico(estado);
    for (const ator of estado.combatentes) {
        const origem = ator.tipo === 'jogador' ? campanha.participantes.find(item => item.id === ator.origem_id)
            : mundo[ator.tipo === 'npc' ? 'personagens' : 'criaturas'].find(item => item.id === ator.origem_id);
        if (!origem || !mundo.ambientes.some(item => item.id === ator.ambiente_id)) throw new Error('Origem do combatente inválida.');
        const modelo = criarCombatente(origem, ator.tipo, ator.ambiente_id);
        for (const campo of ['id', 'nome', 'vida_max', 'energia_max', 'defesa', 'ataque', 'dano']) if (modelo[campo] !== ator[campo]) throw new Error('Estatística de combate incompatível com as regras.');
        if (ator.tipo !== 'jogador' && (ator.recargas.length || ator.preparacao !== null)) throw new Error('Recursos de adversário inválidos.');
        if (ator.tipo === 'jogador' && (ator.recargas.some(item => !origem.ficha.habilidades.some(h => h.id === item.habilidade_id)) || (ator.preparacao && !origem.ficha.habilidades.some(h => h.id === ator.preparacao && h.condicoes.includes('preparacao'))))) throw new Error('Habilidade não pertence à ficha.');
    }
}

function resolverAcaoMecanica(antes, acao, participante, rolar = () => sortearInteiro(1, 21)) {
    validarEstadoMecanico(antes);
    conferirCampos(acao, ['tipo', 'habilidade_id', 'alvo_id', 'posicao'], 'Ação mecânica');
    if (!TIPOS_ACAO.includes(acao.tipo)) throw new Error('Ação mecânica desconhecida.');
    const estado = structuredClone(antes);
    const ator = estado.combatentes.find(item => item.id === idJogador(participante.id));
    if (!ator || ator.vida === 0) throw new Error('Personagem incapacitado.');
    const encontroAtivo = estado.encontro?.estado === 'ativo';
    if (encontroAtivo && (!estado.encontro.participantes_ids.includes(ator.id) || estado.encontro.retirados_ids.includes(ator.id))) throw new Error('Personagem fora do encontro.');
    if (encontroAtivo && estado.encontro.agiram_ids.includes(ator.id)) throw new Error('Personagem já agiu nesta rodada.');
    const alvo = acao.alvo_id === null ? null : estado.combatentes.find(item => item.id === acao.alvo_id && item.ambiente_id === ator.ambiente_id);
    if (acao.alvo_id !== null && (!alvo || alvo.vida === 0)) throw new Error('Alvo inexistente, distante ou incapacitado.');
    const habilidade = ['habilidade', 'preparacao'].includes(acao.tipo) ? participante.ficha.habilidades.find(item => item.id === acao.habilidade_id) : null;
    if (['habilidade', 'preparacao'].includes(acao.tipo) && !habilidade) throw new Error('Habilidade não pertence à ficha.');
    if (habilidade && participante.ficha.nivel < habilidade.nivelMinimo) throw new Error('Nível insuficiente para a habilidade.');
    if (!habilidade && acao.habilidade_id !== null) throw new Error('Habilidade incompatível com a ação.');
    if (!['ataque', 'habilidade', 'aproximacao'].includes(acao.tipo) && alvo) throw new Error('Esta ação não recebe um alvo.');
    if (!['movimento', 'habilidade'].includes(acao.tipo) && acao.posicao !== null) throw new Error('Posição incompatível com a ação.');
    const distancia = destino => Math.abs(ator.posicao - destino.posicao);
    const exigirAlcance = (destino, alcance) => { if (!destino || distancia(destino) > alcance) throw new Error('Alvo fora de alcance.'); };
    const exigirInimigo = destino => { if (!destino || destino.tipo === 'jogador') throw new Error('Alvo inimigo inválido; combate entre jogadores não permitido.'); };
    const exigirAliado = destino => { if (!destino || destino.tipo !== 'jogador') throw new Error('Alvo aliado inválido.'); };
    const deslocamento = ator.efeitos.some(item => item.tipo === 'lentidao') ? 1 : 3;
    let destinos = [], posicao = acao.posicao;
    if (acao.tipo === 'ataque') { exigirInimigo(alvo); exigirAlcance(alvo, 2); destinos = [alvo]; }
    if (acao.tipo === 'aproximacao') {
        if (!alvo || alvo.id === ator.id || distancia(alvo) <= 2) throw new Error('Aproximação sem destino válido.');
        posicao = ator.posicao + Math.sign(alvo.posicao - ator.posicao) * Math.min(deslocamento, distancia(alvo) - 2);
    }
    if (acao.tipo === 'preparacao' && !habilidade.condicoes.includes('preparacao')) throw new Error('Habilidade não exige preparação.');
    if (acao.tipo === 'descanso' && encontroAtivo) throw new Error('Descanso indisponível durante combate.');
    if (acao.tipo === 'fuga' && !encontroAtivo) throw new Error('Nenhum combate ativo.');
    if (acao.tipo === 'habilidade') {
        if (ator.energia < habilidade.custoRecurso) throw new Error('Energia insuficiente.');
        if (ator.recargas.some(item => item.habilidade_id === habilidade.id && item.disponivel_no_turno > ator.turnos + 1)) throw new Error('Habilidade em recarga.');
        if (habilidade.condicoes.includes('preparacao') && ator.preparacao !== habilidade.id) throw new Error('Habilidade exige um turno de preparação.');
        if (habilidade.condicoes.includes('vida_baixa') && ator.vida > ator.vida_max / 3) throw new Error('Habilidade exige vida baixa.');
        if (['ofensiva', 'controle', 'suprema'].includes(habilidade.categoria)) { exigirInimigo(alvo); exigirAlcance(alvo, habilidade.alcance); }
        else if (['defensiva', 'suporte'].includes(habilidade.categoria)) {
            exigirAliado(alvo); exigirAlcance(alvo, habilidade.alcance);
            if (habilidade.alvo === 'Você' && alvo.id !== ator.id) throw new Error('Habilidade exclusiva para o próprio personagem.');
        } else if (alvo) throw new Error('Esta habilidade não recebe alvo combatente.');
        if (habilidade.categoria !== 'mobilidade' && posicao !== null) throw new Error('A habilidade não permite deslocamento.');
        if (alvo) destinos = habilidade.raioArea ? estado.combatentes.filter(item => item.vida > 0 && item.ambiente_id === ator.ambiente_id && (item.tipo === 'jogador') === (alvo.tipo === 'jogador') && Math.abs(item.posicao - alvo.posicao) <= habilidade.raioArea) : [alvo];
    }
    if (['movimento', 'aproximacao'].includes(acao.tipo) || habilidade?.categoria === 'mobilidade') {
        const limite = habilidade ? Math.min(habilidade.alcance, deslocamento) : deslocamento;
        if (!Number.isInteger(posicao) || posicao < 0 || posicao > LIMITE_POSICAO || posicao === ator.posicao || Math.abs(posicao - ator.posicao) > limite) throw new Error('Deslocamento fora do alcance.');
    }
    const hostis = destinos.filter(item => item.tipo !== 'jogador');
    if (hostis.length) {
        if (!encontroAtivo) estado.encontro = { ambiente_id: ator.ambiente_id, rodada: 1, estado: 'ativo', inimigos_ids: [], participantes_ids: estado.combatentes.filter(item => item.tipo === 'jogador' && item.vida > 0 && item.ambiente_id === ator.ambiente_id).map(item => item.id), agiram_ids: [], retirados_ids: [] };
        estado.encontro.inimigos_ids = [...new Set([...estado.encontro.inimigos_ids, ...hostis.map(item => item.id)])];
        if (estado.encontro.inimigos_ids.length > 8) throw new Error('Encontro limitado a oito adversários.');
    }
    const eventos = [], rolagens = [];
    let sucesso = true;
    function testar(agente, destino, modificador, dificuldade, finalidade) {
        const d20 = rolar();
        if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) throw new Error('Rolagem inválida.');
        const total = d20 + modificador, passou = total >= dificuldade;
        rolagens.push({ autor_id: agente.id, alvo_id: destino?.id || null, finalidade, d20, bonus: modificador, total, dificuldade, sucesso: passou });
        eventos.push(`${agente.nome}: ${finalidade}, ${passou ? 'sucesso' : 'falha'} (D20 ${d20} + ${modificador} = ${total}; dificuldade ${dificuldade}).`);
        return passou;
    }
    function efeito(destino, tipo, valor, duracao) {
        destino.efeitos = destino.efeitos.filter(item => item.tipo !== tipo);
        destino.efeitos.push({ tipo, valor, turnos: duracao + (destino.id === ator.id ? 1 : 0) });
    }
    function ferir(agente, destino, potencia) {
        const barreira = destino.efeitos.find(item => item.tipo === 'barreira');
        const absorvido = Math.min(potencia, barreira?.valor || 0);
        destino.efeitos = destino.efeitos.filter(item => item.tipo !== 'barreira');
        const dano = Math.min(destino.vida, Math.max(0, potencia - absorvido));
        destino.vida -= dano;
        if (dano) destino.preparacao = null;
        eventos.push(`${agente.nome} causou ${dano} de dano em ${destino.nome}${absorvido ? `; barreira absorveu ${absorvido}` : ''}. Vida: ${destino.vida}/${destino.vida_max}.`);
        if (!destino.vida) { destino.efeitos = []; destino.preparacao = null; eventos.push(`${destino.nome} ficou incapacitado.`); }
    }
    function terminarTurno(agente) {
        agente.efeitos = agente.efeitos.map(item => ({ ...item, turnos: item.turnos - 1 })).filter(item => item.turnos > 0);
    }
    ator.turnos++;
    if (acao.tipo !== 'preparacao') ator.preparacao = null;
    if (acao.tipo === 'ataque') {
        sucesso = testar(ator, alvo, ator.ataque, alvo.defesa, 'ataque');
        if (sucesso) ferir(ator, alvo, ator.dano);
    } else if (acao.tipo === 'defesa') { efeito(ator, 'barreira', 10, 1); eventos.push(`${ator.nome} se defendeu: proteção de 10 contra o próximo impacto até seu próximo turno.`); }
    else if (['movimento', 'aproximacao'].includes(acao.tipo)) { ator.posicao = posicao; eventos.push(`${ator.nome} avançou para a posição ${posicao} m.`); }
    else if (acao.tipo === 'espera') eventos.push(`${ator.nome} aguardou um turno.`);
    else if (acao.tipo === 'preparacao') { ator.preparacao = habilidade.id; eventos.push(`${ator.nome} preparou ${habilidade.nome}. Receber dano interrompe a preparação.`); }
    else if (acao.tipo === 'descanso') {
        ator.vida = ator.vida_max; ator.energia = ator.energia_max; ator.recargas = []; ator.efeitos = [];
        eventos.push(`${ator.nome} completou um descanso fora de combate: vida e energia restauradas.`);
    } else if (acao.tipo === 'fuga') {
        sucesso = testar(ator, null, bonus(participante.ficha.atributos.destreza), 12, 'fuga');
        if (sucesso) { estado.encontro.retirados_ids.push(ator.id); eventos.push(`${ator.nome} se retirou do encontro; os demais participantes ainda decidem suas ações.`); }
    } else if (acao.tipo === 'habilidade') {
        ator.energia -= habilidade.custoRecurso;
        ator.recargas = ator.recargas.filter(item => item.habilidade_id !== habilidade.id);
        ator.recargas.push({ habilidade_id: habilidade.id, disponivel_no_turno: ator.turnos + habilidade.recarga });
        eventos.push(`${ator.nome} usou ${habilidade.nome}: energia ${ator.energia}/${ator.energia_max}; recarga de ${habilidade.recarga} turnos próprios.`);
        let acertos = 0;
        for (const destino of destinos) {
            if (['ofensiva', 'suprema', 'controle'].includes(habilidade.categoria)) {
                const atributo = habilidade.id === 'golpe_preciso' ? 'forca' : 'inteligencia';
                if (testar(ator, destino, bonus(participante.ficha.atributos[atributo]), destino.defesa, habilidade.nome)) {
                    acertos++;
                    if (habilidade.categoria === 'controle') { efeito(destino, 'lentidao', 1, habilidade.duracao); eventos.push(`${destino.nome} ficou lento por um turno próprio.`); }
                    else ferir(ator, destino, habilidade.potencia);
                }
            } else if (habilidade.categoria === 'defensiva') { efeito(destino, 'barreira', habilidade.potencia, habilidade.duracao); eventos.push(`${destino.nome} recebeu uma barreira de ${habilidade.potencia}.`); }
            else if (habilidade.categoria === 'suporte') { const cura = Math.min(habilidade.potencia, destino.vida_max - destino.vida); destino.vida += cura; eventos.push(`${destino.nome} recuperou ${cura} de vida. Vida: ${destino.vida}/${destino.vida_max}.`); }
        }
        if (hostis.length) sucesso = acertos > 0;
        if (habilidade.categoria === 'mobilidade') { ator.posicao = posicao; eventos.push(`${ator.nome} se reposicionou em ${posicao} m.`); }
        if (habilidade.categoria === 'utilitaria') { efeito(ator, habilidade.id === 'percepcao' ? 'percepcao' : 'marcacao', 0, habilidade.duracao); eventos.push(`${habilidade.nome} ativo por ${habilidade.duracao} turno(s); não concede descobertas automáticas.`); }
    }
    terminarTurno(ator);
    const encontro = estado.encontro;
    if (encontro?.estado === 'ativo') {
        encontro.agiram_ids.push(ator.id);
        const adversarios = () => estado.combatentes.filter(item => encontro.inimigos_ids.includes(item.id) && item.vida > 0);
        const aliados = () => estado.combatentes.filter(item => encontro.participantes_ids.includes(item.id) && !encontro.retirados_ids.includes(item.id) && item.vida > 0);
        if (!adversarios().length) { encontro.estado = 'vitoria'; eventos.push('Encontro encerrado: adversários incapacitados.'); }
        else if (!aliados().length) { encontro.estado = encontro.retirados_ids.length ? 'fuga' : 'derrota'; eventos.push(`Encontro encerrado: ${encontro.estado}.`); }
        else if (aliados().every(item => encontro.agiram_ids.includes(item.id))) {
            for (const inimigo of adversarios()) {
                const vitima = aliados().sort((a, b) => Math.abs(a.posicao - inimigo.posicao) - Math.abs(b.posicao - inimigo.posicao) || a.id.localeCompare(b.id))[0];
                if (!vitima) break;
                inimigo.turnos++;
                const movimento = inimigo.efeitos.some(item => item.tipo === 'lentidao') ? 1 : 3;
                const distanciaAtual = Math.abs(inimigo.posicao - vitima.posicao);
                if (distanciaAtual > 2) {
                    inimigo.posicao += Math.sign(vitima.posicao - inimigo.posicao) * Math.min(movimento, distanciaAtual - 2);
                    eventos.push(`${inimigo.nome} se aproximou até a posição ${inimigo.posicao} m.`);
                } else if (testar(inimigo, vitima, inimigo.ataque, vitima.defesa, 'contra-ataque')) ferir(inimigo, vitima, inimigo.dano);
                terminarTurno(inimigo);
            }
            if (!aliados().length) { encontro.estado = encontro.retirados_ids.length ? 'fuga' : 'derrota'; eventos.push(`Encontro encerrado: ${encontro.estado}.`); }
            else { encontro.rodada++; encontro.agiram_ids = []; }
        }
    }
    validarEstadoMecanico(estado);
    return { versao: '1.0', autor_id: participante.id, ambiente_id: ator.ambiente_id, acao: structuredClone(acao), sucesso,
        eventos, rolagens, resumo: eventos.join(' '), antes: structuredClone(antes), depois: estado };
}

function validarResultadoMecanico(resultado, participante, campanha, mundo) {
    conferirCampos(resultado, ['versao', 'autor_id', 'ambiente_id', 'acao', 'sucesso', 'eventos', 'rolagens', 'resumo', 'antes', 'depois'], 'Resultado mecânico');
    conferirOrigens(resultado.antes, campanha, mundo);
    conferirOrigens(resultado.depois, campanha, mundo);
    if (!Array.isArray(resultado.rolagens)) throw new Error('Rolagens inválidas.');
    let indice = 0;
    const esperado = resolverAcaoMecanica(resultado.antes, resultado.acao, participante, () => resultado.rolagens[indice++]?.d20);
    if (indice !== resultado.rolagens.length || !saoIguais(resultado, esperado)) throw new Error('Resultado mecânico incompatível.');
}

function apresentarResultadoMecanico(resultado) {
    if (!resultado) return null;
    const { antes, depois, ...publico } = resultado;
    return structuredClone(publico);
}

module.exports = { iniciarMecanica, prepararEstadoMecanico, conferirOrigens, resolverAcaoMecanica, validarResultadoMecanico, apresentarResultadoMecanico, idJogador };
