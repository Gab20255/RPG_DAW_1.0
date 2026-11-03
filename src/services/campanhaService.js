const { randomUUID: criarIdentificador } = require('node:crypto');
const { isDeepStrictEqual: saoIguais } = require('node:util');
const { validarMundo } = require('../prompts/mundoPrompt');
const { MODELO_CENA, conferirCampos, conferirTexto, conferirLista, chaveTexto, identificadorTexto, validarDirecao } = require('../rules/narrativa');
const { interpretarTeste, resolverTeste } = require('../rules/testes');
const { prepararFichaCampanha, validarParticipantes, validarIdentificador, obterParticipante, conferirAutoria } = require('./participantesCampanhaService');
const { iniciarMecanica, prepararEstadoMecanico, conferirOrigens, resolverAcaoMecanica, validarResultadoMecanico, idJogador } = require('./combateService');
const { interpretarAcaoMecanica } = require('./interpretacaoAcaoService');

function iniciarCampanha(mundo) {
    validarMundo(mundo);
    const direcao = mundo.historia.direcao ? structuredClone(validarDirecao(mundo.historia.direcao)) : {
        conflito: mundo.historia.conflito_principal.slice(0, 400), objetivo: mundo.historia.objetivo_principal.slice(0, 400),
        gancho: (mundo.ganchos_aventura[0] || mundo.historia.preludio).slice(0, 400),
        desfechos_possiveis: ['O grupo pode resolver o conflito, negociar uma alternativa ou abandonar o objetivo com consequências.'],
    };
    return {
        versao: '1.2', id: criarIdentificador(), turno: 0, estado: 'em_andamento', participantes: [], mecanica: iniciarMecanica(),
        direcao, direcao_definida: Boolean(mundo.historia.direcao), ambiente_id: mundo.mundo.ambiente_inicial_id,
        resumo: mundo.historia.preludio.slice(0, 1600),
        memoria: { fatos: [], pistas: [], decisoes: [], acontecimentos: [], npcs_encontrados: [] },
        objetivos: [{ id: 'objetivo_principal', descricao: direcao.objetivo, estado: 'pendente', motivo: '', atualizado_no_turno: 0 }],
        conteudo: { ambientes: [], personagens: [], criaturas: [], itens: [], missoes: [] },
        diario: [], pendente: null, desfecho: null,
    };
}

function obterMundoCampanha(mundo, campanha) {
    const atual = structuredClone(mundo);
    delete atual.campanha;
    if (!campanha) return validarMundo(atual);
    for (const colecao of Object.keys(campanha.conteudo)) atual[colecao].push(...structuredClone(campanha.conteudo[colecao]));
    for (const novo of campanha.conteudo.ambientes) {
        for (const id of novo.conexoes_ids) {
            const vizinho = atual.ambientes.find(ambiente => ambiente.id === id);
            if (!vizinho) throw new Error('Conexão narrativa inexistente.');
            if (!vizinho.conexoes_ids.includes(novo.id)) vizinho.conexoes_ids.push(novo.id);
        }
    }
    atual.ambientes.forEach(ambiente => { ambiente.personagens_ids = atual.personagens.filter(npc => npc.ambiente_id === ambiente.id).map(npc => npc.id); });
    atual.historia.conflito_principal = campanha.direcao.conflito;
    atual.historia.objetivo_principal = campanha.direcao.objetivo;
    atual.historia.situacao_atual = campanha.resumo;
    return validarMundo(atual);
}

function validarCampanha(campanha, mundo) {
    const comMecanica = campanha?.versao === '1.2';
    const comFichas = ['1.1', '1.2'].includes(campanha?.versao);
    conferirCampos(campanha, ['versao', 'id', 'turno', 'estado', 'direcao', 'direcao_definida', 'ambiente_id', 'resumo', 'memoria', 'objetivos', 'conteudo', 'diario', 'pendente', 'desfecho', ...(comFichas ? ['participantes'] : []), ...(comMecanica ? ['mecanica'] : [])], 'Campanha');
    conferirTexto(campanha.id, 80, 'ID da campanha');
    if (!['1.0', '1.1', '1.2'].includes(campanha.versao) || !/^[a-zA-Z0-9_-]{1,80}$/.test(campanha.id) || !Number.isInteger(campanha.turno) || campanha.turno < 0 || !['em_andamento', 'concluida'].includes(campanha.estado) || typeof campanha.direcao_definida !== 'boolean') throw new Error('Estado da campanha inválido.');
    if (comFichas) validarParticipantes(campanha, mundo);
    validarDirecao(campanha.direcao);
    conferirTexto(campanha.resumo, 1600, 'Resumo');
    conferirCampos(campanha.conteudo, ['ambientes', 'personagens', 'criaturas', 'itens', 'missoes'], 'Conteúdo');
    for (const lista of Object.values(campanha.conteudo)) if (!Array.isArray(lista)) throw new Error('Catálogo da campanha inválido.');
    const atual = obterMundoCampanha(mundo, campanha);
    if (comMecanica) conferirOrigens(campanha.mecanica, campanha, atual);
    const tiposCena = ['observacao', 'dialogo', 'transicao', 'intencao', ...(comFichas ? ['teste'] : []), ...(comMecanica ? ['mecanica'] : [])];
    let mecanicaAnterior = iniciarMecanica();
    function conferirMecanica(cena) {
        if (!comMecanica) return;
        if (cena.tipo !== 'mecanica') { if (cena.resultado !== null) throw new Error('Resultado em cena incompatível.'); return; }
        const autor = obterParticipante(campanha, cena.participante_id);
        if (!autor || !cena.resultado || cena.resultado.ambiente_id !== cena.ambiente_id) throw new Error('Resultado mecânico sem autor ou ambiente.');
        const mundoAnterior = { ...atual };
        for (const colecao of ['personagens', 'criaturas']) mundoAnterior[colecao] = [...mundo[colecao], ...campanha.conteudo[colecao].filter(item => Number(item.id.split('_').at(-1)) < cena.turno)];
        const esperadoAntes = prepararEstadoMecanico({ ...campanha, ambiente_id: cena.ambiente_id, mecanica: mecanicaAnterior,
            participantes: campanha.participantes.filter(item => item.ingresso_no_turno < cena.turno) }, mundoAnterior);
        if (!saoIguais(cena.resultado.antes, esperadoAntes)) throw new Error('Resultado rompe a continuidade mecânica da campanha.');
        const acao = interpretarAcaoMecanica(cena.acao, autor, cena.resultado.antes, cena.ambiente_id);
        if (!saoIguais(acao, cena.resultado.acao)) throw new Error('Resultado incompatível com a ação solicitada.');
        validarResultadoMecanico(cena.resultado, autor, campanha, atual);
        mecanicaAnterior = cena.resultado.depois;
    }
    if (!atual.ambientes.some(local => local.id === campanha.ambiente_id)) throw new Error('Cena da campanha inexistente.');
    conferirCampos(campanha.memoria, ['fatos', 'pistas', 'decisoes', 'acontecimentos', 'npcs_encontrados'], 'Memória');
    for (const tipo of ['fatos', 'pistas', 'decisoes', 'acontecimentos']) {
        const registros = campanha.memoria[tipo];
        if (!Array.isArray(registros) || new Set(registros.map(item => item.id)).size !== registros.length) throw new Error('Memória duplicada ou inválida.');
        for (const registro of registros) {
            conferirCampos(registro, ['id', 'texto', 'turno', ...(comFichas && tipo === 'decisoes' ? ['participante_id'] : [])], 'Registro de memória');
            conferirTexto(registro.id, 80, 'ID da memória');
            conferirTexto(registro.texto, tipo === 'decisoes' ? 1000 : 300, 'Memória');
            if (!Number.isInteger(registro.turno) || registro.turno < 1 || registro.turno > campanha.turno) throw new Error('Turno da memória inválido.');
        }
    }
    if (!Array.isArray(campanha.memoria.npcs_encontrados) || new Set(campanha.memoria.npcs_encontrados).size !== campanha.memoria.npcs_encontrados.length || campanha.memoria.npcs_encontrados.some(id => !atual.personagens.some(npc => npc.id === id))) throw new Error('Encontros inválidos.');
    if (!Array.isArray(campanha.objetivos) || !campanha.objetivos.some(item => item.id === 'objetivo_principal') || new Set(campanha.objetivos.map(item => item.id)).size !== campanha.objetivos.length) throw new Error('Objetivos inválidos.');
    for (const objetivo of campanha.objetivos) {
        conferirCampos(objetivo, ['id', 'descricao', 'estado', 'motivo', 'atualizado_no_turno'], 'Objetivo');
        conferirTexto(objetivo.id, 80, 'ID do objetivo');
        conferirTexto(objetivo.descricao, 400, 'Objetivo');
        conferirTexto(objetivo.motivo, 300, 'Motivo', true);
        if (!['pendente', 'concluido', 'abandonado'].includes(objetivo.estado) || !Number.isInteger(objetivo.atualizado_no_turno) || objetivo.atualizado_no_turno < 0 || objetivo.atualizado_no_turno > campanha.turno) throw new Error('Estado de objetivo inválido.');
    }
    if (!Array.isArray(campanha.diario) || campanha.diario.length !== campanha.turno || new Set(campanha.diario.map(item => item.id)).size !== campanha.diario.length) throw new Error('Diário inválido.');
    campanha.diario.forEach((cena, indice) => {
        conferirCampos(cena, ['id', 'turno', 'acao', 'tipo', 'ambiente_id', 'narracao', 'resumo', 'exige_resolucao_mecanica', ...(comFichas ? ['participante_id', 'personagem_id', 'teste'] : []), ...(comMecanica ? ['resultado'] : [])], 'Cena salva');
        conferirTexto(cena.id, 80, 'ID da cena');
        conferirTexto(cena.acao, 1000, 'Ação');
        conferirTexto(cena.narracao, 4000, 'Narração');
        conferirTexto(cena.resumo, 1600, 'Resumo');
        if (cena.turno !== indice + 1 || !tiposCena.includes(cena.tipo) || typeof cena.exige_resolucao_mecanica !== 'boolean' || !atual.ambientes.some(item => item.id === cena.ambiente_id)) throw new Error('Cena salva inválida.');
        if (comFichas) conferirAutoria(cena, campanha);
        conferirMecanica(cena);
    });
    if (campanha.memoria.decisoes.length !== campanha.diario.length || campanha.memoria.decisoes.some((registro, indice) => {
        const cena = campanha.diario[indice];
        return registro.id !== cena.id || registro.turno !== cena.turno || registro.texto !== cena.acao || (comFichas && registro.participante_id !== cena.participante_id);
    })) throw new Error('Ações registradas incompatíveis com o diário.');
    const ultima = campanha.diario.at(-1);
    if (ultima && (ultima.resumo !== campanha.resumo || ultima.ambiente_id !== campanha.ambiente_id)) throw new Error('Situação atual incompatível com o diário.');
    if (campanha.objetivos.find(item => item.id === 'objetivo_principal').descricao !== campanha.direcao.objetivo) throw new Error('Objetivo principal incompatível com a direção.');
    if (campanha.pendente !== null) {
        conferirCampos(campanha.pendente, ['id', 'turno', 'acao', 'tipo', 'ambiente_id', 'resposta', ...(comFichas ? ['participante_id', 'personagem_id', 'teste'] : []), ...(comMecanica ? ['resultado'] : [])], 'Cena pendente');
        const pendente = campanha.pendente;
        conferirTexto(pendente.id, 80, 'Pedido');
        conferirTexto(pendente.acao, 1000, 'Ação pendente');
        const origem = atual.ambientes.find(local => local.id === campanha.ambiente_id);
        if (pendente.turno !== campanha.turno + 1 || !tiposCena.includes(pendente.tipo) || campanha.diario.some(cena => cena.id === pendente.id) || (pendente.tipo === 'transicao' ? !origem.conexoes_ids.includes(pendente.ambiente_id) : pendente.ambiente_id !== campanha.ambiente_id)) throw new Error('Cena pendente incompatível.');
        if (comFichas) conferirAutoria(pendente, campanha);
        conferirMecanica(pendente);
        if (pendente.resposta !== null) validarRespostaCena(pendente.resposta, campanha, atual);
    }
    if (comMecanica) {
        const ultimoResultado = campanha.pendente?.resultado || campanha.diario.findLast(cena => cena.resultado)?.resultado;
        if (!saoIguais(campanha.mecanica, ultimoResultado?.depois || iniciarMecanica())) throw new Error('Estado mecânico incompatível com o último resultado salvo.');
    }
    if (campanha.estado === 'concluida') {
        conferirTexto(campanha.desfecho, 1200, 'Desfecho');
        if (campanha.pendente || campanha.mecanica?.encontro?.estado === 'ativo' || campanha.objetivos.find(item => item.id === 'objetivo_principal').estado === 'pendente') throw new Error('Encerramento incompatível.');
    } else if (campanha.desfecho !== null) throw new Error('Desfecho antecipado.');
    return campanha;
}

function migrarCampanha(campanha, mundo) {
    validarCampanha(campanha, mundo);
    const atualizada = structuredClone(campanha);
    if (campanha.versao === '1.0') {
        atualizada.versao = '1.1';
        atualizada.participantes = [];
        for (const cena of [...atualizada.diario, ...(atualizada.pendente ? [atualizada.pendente] : [])]) Object.assign(cena, { participante_id: null, personagem_id: null, teste: null });
        atualizada.memoria.decisoes.forEach(registro => { registro.participante_id = null; });
    }
    if (atualizada.versao === '1.1') {
        atualizada.versao = '1.2';
        atualizada.mecanica = iniciarMecanica();
        for (const cena of [...atualizada.diario, ...(atualizada.pendente ? [atualizada.pendente] : [])]) cena.resultado = null;
    }
    return validarCampanha(atualizada, mundo);
}

function vincularParticipante(campanha, mundo, id, ficha) {
    const proxima = migrarCampanha(campanha, mundo);
    validarIdentificador(id);
    if (proxima.pendente || proxima.estado === 'concluida') throw new Error('Vínculo indisponível com cena pendente ou campanha concluída.');
    if (proxima.mecanica.encontro?.estado === 'ativo') throw new Error('Vínculo indisponível durante combate.');
    if (proxima.participantes.some(item => item.id === id || item.ficha.id === ficha?.id)) throw new Error('Participante ou ficha já vinculado.');
    proxima.participantes.push({ id, ficha: prepararFichaCampanha(ficha, mundo), ingresso_no_turno: proxima.turno });
    return validarCampanha(proxima, mundo);
}

function registrarAcaoCampanha(campanha, mundo, entrada, { participanteId = null, rolar } = {}) {
    campanha = migrarCampanha(campanha, mundo);
    conferirTexto(entrada, 1000, 'Ação');
    if (campanha.pendente) throw new Error('Cena anterior pendente.');
    if (campanha.estado === 'concluida') throw new Error('Campanha concluída.');
    const participante = obterParticipante(campanha, participanteId);
    const proxima = structuredClone(campanha);
    const atual = obterMundoCampanha(mundo, campanha);
    const acao = entrada.trim();
    let tipo = 'intencao';
    let teste = null;
    let resultado = null;
    let ambienteId = campanha.ambiente_id;
    const estadoMecanico = prepararEstadoMecanico(campanha, atual);
    const acaoMecanica = interpretarAcaoMecanica(acao, participante, estadoMecanico, ambienteId);
    if (acaoMecanica) {
        resultado = resolverAcaoMecanica(estadoMecanico, acaoMecanica, participante, rolar);
        proxima.mecanica = structuredClone(resultado.depois);
        tipo = 'mecanica';
    } else if (acao === '/observar') tipo = 'observacao';
    else if (/^\/falar\s+\S/.test(acao)) tipo = 'dialogo';
    else if (acao.startsWith('/ir ')) {
        if (estadoMecanico.encontro?.estado === 'ativo') throw new Error('Deslocamento entre ambientes indisponível durante combate.');
        if (estadoMecanico.combatentes.some(item => item.tipo === 'jogador' && !item.vida)) throw new Error('O grupo possui personagens incapacitados.');
        const local = atual.ambientes.find(item => item.id === ambienteId);
        const destino = acao.slice(4).trim();
        const id = /^\d+$/.test(destino) ? local.conexoes_ids[Number(destino) - 1] : destino;
        if (!local.conexoes_ids.includes(id)) throw new Error('Destino inválido.');
        ambienteId = id;
        tipo = 'transicao';
    } else if (/^\/teste(?:\s|$)/.test(acao)) {
        if (!participante) throw new Error('Teste exige uma ficha vinculada.');
        if (estadoMecanico.encontro?.estado === 'ativo') throw new Error('Durante combate, execute uma ação de combate.');
        if (!estadoMecanico.combatentes.find(item => item.id === idJogador(participante.id))?.vida) throw new Error('Personagem incapacitado.');
        const { atributo, descricao } = interpretarTeste(acao);
        teste = resolverTeste(participante.ficha.atributos, atributo, descricao, rolar);
        tipo = 'teste';
    } else if (acao.startsWith('/')) throw new Error('Comando narrativo desconhecido.');
    proxima.pendente = { id: criarIdentificador(), turno: campanha.turno + 1, acao, tipo, ambiente_id: ambienteId, resposta: null,
        participante_id: participante?.id || null, personagem_id: participante?.ficha.id || null, teste, resultado };
    return validarCampanha(proxima, mundo);
}

function validarRespostaCena(resposta, campanha, atual) {
    conferirCampos(resposta, Object.keys(MODELO_CENA), 'Resposta do Mestre');
    const pendente = campanha.pendente;
    if (!pendente || resposta.pedido_id !== pendente.id || resposta.turno !== pendente.turno || resposta.ambiente_id !== pendente.ambiente_id) throw new Error('Resposta de outra cena.');
    conferirTexto(resposta.narracao, 4000, 'Narração');
    conferirTexto(resposta.resumo, 1600, 'Resumo');
    conferirLista(resposta.direcao, 1, validarDirecao, 'Direção');
    if (!campanha.direcao_definida && resposta.direcao.length !== 1) throw new Error('Direção concreta ausente.');
    if (campanha.direcao_definida && resposta.direcao.length && !saoIguais(resposta.direcao[0], campanha.direcao)) throw new Error('A direção confirmada não pode ser substituída.');
    for (const [campo, limite] of [['fatos', 4], ['pistas', 3], ['acontecimentos', 2]]) conferirLista(resposta[campo], limite, texto => conferirTexto(texto, 300, campo), campo);
    const ids = new Set();
    conferirLista(resposta.objetivos, 4, item => {
        conferirCampos(item, ['id', 'estado', 'motivo'], 'Atualização de objetivo');
        const objetivo = campanha.objetivos.find(objetivo => objetivo.id === item.id);
        if (!objetivo || ids.has(item.id) || !['pendente', 'concluido', 'abandonado'].includes(item.estado) || (objetivo.estado !== 'pendente' && item.estado !== objetivo.estado)) throw new Error('Transição de objetivo inválida.');
        conferirTexto(item.motivo, 300, 'Motivo do objetivo');
        ids.add(item.id);
    }, 'Objetivos');
    conferirCampos(resposta.novidades, Object.keys(MODELO_CENA.novidades), 'Novidades');
    const colecoes = { locais: 'ambientes', npcs: 'personagens', criaturas: 'criaturas', itens: 'itens', missoes: 'missoes' };
    for (const [tipo, modelo] of Object.entries(MODELO_CENA.novidades)) {
        conferirLista(resposta.novidades[tipo], 1, item => {
            conferirCampos(item, Object.keys(modelo[0]), `Novo conteúdo: ${tipo}`);
            for (const [campo, valor] of Object.entries(item)) conferirTexto(valor, ['nome', 'titulo'].includes(campo) ? 80 : 300, campo);
            const nome = item.nome || item.titulo;
            if (atual[colecoes[tipo]].some(existente => chaveTexto(existente.nome || existente.titulo) === chaveTexto(nome))) throw new Error('A novidade já existe no mundo.');
        }, tipo);
    }
    if (Object.values(resposta.novidades).reduce((soma, lista) => soma + lista.length, 0) > 2) throw new Error('No máximo duas novidades por cena.');
    if (typeof resposta.exige_resolucao_mecanica !== 'boolean') throw new Error('Resolução mecânica inválida.');
    conferirCampos(resposta.encerramento, ['concluir', 'desfecho'], 'Encerramento');
    if (typeof resposta.encerramento.concluir !== 'boolean') throw new Error('Encerramento inválido.');
    conferirTexto(resposta.encerramento.desfecho, 1200, 'Desfecho', !resposta.encerramento.concluir);
    const principal = resposta.objetivos.find(item => item.id === 'objetivo_principal') || campanha.objetivos.find(item => item.id === 'objetivo_principal');
    if (resposta.encerramento.concluir && (principal.estado === 'pendente' || resposta.exige_resolucao_mecanica || pendente.tipo === 'observacao')) throw new Error('Conclusão da campanha ainda não autorizada.');
    if (!resposta.encerramento.concluir && resposta.encerramento.desfecho) throw new Error('Desfecho sem encerramento.');
    if (resposta.exige_resolucao_mecanica && resposta.objetivos.some(item => item.estado !== 'pendente')) throw new Error('Objetivo depende de resolução mecânica.');
    if (pendente.teste && !pendente.teste.sucesso && resposta.objetivos.some(item => item.estado === 'concluido')) throw new Error('Um teste com falha não autoriza concluir objetivos.');
    if (pendente.resultado && !pendente.resultado.sucesso && resposta.objetivos.some(item => item.estado === 'concluido')) throw new Error('Ação mecânica fracassada não autoriza concluir objetivos.');
    if (resposta.encerramento.concluir && campanha.mecanica?.encontro?.estado === 'ativo') throw new Error('Combate em andamento impede encerrar a campanha.');
    return resposta;
}

function guardarLembrancas(campanha, tipo, textos) {
    for (const texto of textos) {
        const id = identificadorTexto(tipo, texto);
        if (!campanha.memoria[tipo].some(item => item.id === id)) campanha.memoria[tipo].push({ id, texto: texto.trim(), turno: campanha.turno });
    }
}

function incorporarNovidades(campanha, resposta) {
    const local = resposta.ambiente_id;
    const prefixo = campanha.id.slice(0, 8);
    const novoId = tipo => `${tipo}_${prefixo}_${campanha.turno}`;
    for (const item of resposta.novidades.locais) campanha.conteudo.ambientes.push({ id: novoId('ambiente'), nome: item.nome.trim(), tipo: 'local descoberto', descricao: item.descricao.trim(), importancia: 'Local descoberto durante a campanha.', perigos: [], conexoes_ids: [local], personagens_ids: [], prompt_imagem: `${item.nome}. ${item.descricao}` });
    for (const item of resposta.novidades.npcs) campanha.conteudo.personagens.push({ id: novoId('npc'), nome: item.nome.trim(), papel: 'neutro', descricao: item.descricao.trim(), aparencia: item.descricao.trim(), personalidade: 'Personalidade a desenvolver nos encontros.', motivacao: item.motivacao.trim(), segredo: 'Nenhum segredo estabelecido.', faccoes_ids: [], ambiente_id: local, prompt_imagem: `${item.nome}. ${item.descricao}` });
    for (const item of resposta.novidades.criaturas) campanha.conteudo.criaturas.push({ id: novoId('criatura'), nome: item.nome.trim(), descricao: item.descricao.trim(), comportamento: item.comportamento.trim(), ameaca: 'a avaliar pelas regras', ambientes_ids: [local] });
    for (const item of resposta.novidades.itens) campanha.conteudo.itens.push({ id: novoId('item'), nome: item.nome.trim(), tipo: 'objeto descoberto', descricao: item.descricao.trim(), efeito: 'Sem efeito mecânico ou posse concedidos.', raridade: 'a avaliar', ambiente_id: local });
    for (const item of resposta.novidades.missoes) {
        const id = novoId('missao');
        campanha.conteudo.missoes.push({ id, titulo: item.titulo.trim(), tipo: 'secundaria', descricao: item.objetivo.trim(), objetivo: item.objetivo.trim(), ambientes_ids: [local], personagens_ids: [], recompensas: [] });
        campanha.objetivos.push({ id: `objetivo_${id}`, descricao: item.objetivo.trim(), estado: 'pendente', motivo: '', atualizado_no_turno: campanha.turno });
    }
}

function aplicarCena(campanha, mundo, resposta) {
    campanha = migrarCampanha(campanha, mundo);
    validarRespostaCena(resposta, campanha, obterMundoCampanha(mundo, campanha));
    const proxima = structuredClone(campanha);
    const pedido = proxima.pendente;
    proxima.turno = pedido.turno;
    proxima.ambiente_id = pedido.ambiente_id;
    proxima.resumo = resposta.resumo.trim();
    if (resposta.direcao.length && !proxima.direcao_definida) {
        proxima.direcao = structuredClone(resposta.direcao[0]);
        proxima.direcao_definida = true;
        proxima.objetivos.find(item => item.id === 'objetivo_principal').descricao = proxima.direcao.objetivo;
    }
    for (const tipo of ['fatos', 'pistas', 'acontecimentos']) guardarLembrancas(proxima, tipo, resposta[tipo]);
    proxima.memoria.decisoes.push({ id: pedido.id, texto: pedido.acao, turno: pedido.turno, participante_id: pedido.participante_id });
    for (const atualizacao of resposta.objetivos) Object.assign(proxima.objetivos.find(item => item.id === atualizacao.id), atualizacao, { atualizado_no_turno: proxima.turno });
    incorporarNovidades(proxima, resposta);
    const atual = obterMundoCampanha(mundo, proxima);
    proxima.memoria.npcs_encontrados = [...new Set([...proxima.memoria.npcs_encontrados, ...atual.personagens.filter(npc => npc.ambiente_id === proxima.ambiente_id).map(npc => npc.id)])];
    proxima.diario.push({ id: pedido.id, turno: pedido.turno, acao: pedido.acao, tipo: pedido.tipo, ambiente_id: pedido.ambiente_id,
        participante_id: pedido.participante_id, personagem_id: pedido.personagem_id, teste: structuredClone(pedido.teste), resultado: structuredClone(pedido.resultado),
        narracao: resposta.narracao.trim(), resumo: proxima.resumo, exige_resolucao_mecanica: resposta.exige_resolucao_mecanica });
    proxima.pendente = null;
    if (resposta.encerramento.concluir) { proxima.estado = 'concluida'; proxima.desfecho = resposta.encerramento.desfecho.trim(); }
    return validarCampanha(proxima, mundo);
}

class CondutorCampanha {
    constructor({ carregar, salvar, consultar, rolar, aoResultado = () => {} }) {
        this.carregar = carregar;
        this.salvar = salvar;
        this.consultar = consultar;
        this.rolar = rolar;
        this.aoResultado = aoResultado;
        this.fila = Promise.resolve();
        this.respostas = new Map();
    }

    enfileirar(tarefa) {
        const operacao = this.fila.then(tarefa);
        this.fila = operacao.catch(() => {});
        return operacao;
    }

    executar(entrada, { participanteId = null } = {}) {
        return this.enfileirar(() => this.processar(entrada, participanteId));
    }

    vincular(id, ficha) {
        const copia = structuredClone(ficha);
        return this.enfileirar(async () => {
            const { mundo, campanha } = await this.carregar();
            const proxima = vincularParticipante(campanha, mundo, id, copia);
            await this.salvar(proxima);
            return proxima;
        });
    }

    async processar(entrada, participanteId) {
        const { montarContextoCampanha } = require('./contextoCampanhaService');
        const { mundo, campanha: salva } = await this.carregar();
        let campanha = migrarCampanha(salva || iniciarCampanha(mundo), mundo);
        if (['/repetir', '/descartar'].includes(entrada) && campanha.pendente && participanteId !== null && participanteId !== campanha.pendente.participante_id) throw new Error('A cena pendente pertence a outro participante.');
        if (entrada === '/descartar') {
            if (campanha.pendente?.teste || campanha.pendente?.resultado) throw new Error('Ação já resolvida; a narração continua pendente.');
            if (campanha.pendente) this.respostas.delete(campanha.pendente.id);
            campanha.pendente = null;
            await this.salvar(campanha);
            return { campanha, narracao: null };
        }
        if (entrada === '/repetir' && !campanha.pendente) {
            if (campanha.diario.at(-1)?.teste || campanha.diario.at(-1)?.resultado) await this.aoResultado(structuredClone(campanha.diario.at(-1)));
            return { campanha, narracao: campanha.diario.at(-1)?.narracao || mundo.historia.preludio };
        }
        if (entrada !== '/repetir') {
            campanha = registrarAcaoCampanha(campanha, mundo, entrada, { participanteId, rolar: this.rolar });
            await this.salvar(campanha);
        }
        const pedido = campanha.pendente;
        if (pedido.teste || pedido.resultado) await this.aoResultado(structuredClone(pedido));
        let resposta = pedido.resposta || this.respostas.get(pedido.id);
        if (!resposta) {
            resposta = await this.consultar(montarContextoCampanha(mundo, campanha));
            try { validarRespostaCena(resposta, campanha, obterMundoCampanha(mundo, campanha)); }
            catch (erro) { erro.code ||= 'CENA_INVALIDA'; throw erro; }
            this.respostas.set(pedido.id, structuredClone(resposta));
        }
        if (!pedido.resposta) {
            pedido.resposta = structuredClone(resposta);
            await this.salvar(campanha);
        }
        const concluida = aplicarCena(campanha, mundo, resposta);
        await this.salvar(concluida);
        this.respostas.delete(pedido.id);
        return { campanha: concluida, narracao: resposta.narracao };
    }
}

module.exports = { iniciarCampanha, migrarCampanha, vincularParticipante, obterMundoCampanha, validarCampanha, registrarAcaoCampanha, validarRespostaCena, aplicarCena, CondutorCampanha };
