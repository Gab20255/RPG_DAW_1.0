const { idJogador } = require('./combateService');

function normalizarAcao(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function interpretarAcaoMecanica(entrada, participante, estado, ambienteId) {
    const texto = normalizarAcao(entrada);
    const comando = entrada.startsWith('/') ? entrada.split(/\s/)[0] : null;
    const comandos = ['/atacar', '/usar', '/defender', '/mover', '/aproximar', '/esperar', '/descansar', '/fugir', '/preparar'];
    if (comando && !comandos.includes(comando)) return null;
    if (!comando && !/^(?:(?:eu )?(?:ataco|atacar|ataque|golpeio|uso|usar|utilizo|lanco|curo|defendo|me defendo|defender|me aproximo|aproximo|movo|me movo|espero|aguardo|descanso|fujo|fugir|preparo))\b/.test(texto)) return null;
    if (!participante) throw new Error('Ação mecânica exige uma ficha vinculada.');
    if (!comando && /\b(e depois|em seguida|e uso|e ataco|e curo|se |nao |caso )/.test(`${texto} `)) throw new Error('Ação composta ou condicional; escolha uma ação por turno.');
    const acao = { tipo: '', habilidade_id: null, alvo_id: null, posicao: null };
    const semInicio = texto.replace(/^eu /, '');
    const conteudo = comando ? entrada.slice(comando.length).trim() : semInicio;
    const atorId = idJogador(participante.id);
    const locais = estado.combatentes.filter(item => item.ambiente_id === ambienteId);
    function encontrarAlvo(referencia, aliado) {
        const candidatosPorTipo = locais.filter(item => (item.tipo === 'jogador') === aliado);
        const exatos = candidatosPorTipo.filter(item => [item.id, item.origem_id, item.nome].some(nome => normalizarAcao(nome) === normalizarAcao(referencia)));
        if (exatos.length === 1) return exatos[0].id;
        if (exatos.length > 1) throw new Error('Alvo ambíguo; informe o identificador.');
        const limpar = valor => normalizarAcao(valor).replace(/\b(o|a|os|as|um|uma|meu|minha|contra|em|no|na|do|da|de|ao|para)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const alvoTexto = limpar(referencia);
        if (aliado && ['', 'mim', 'eu', 'mesmo', 'mim mesmo'].includes(alvoTexto)) return atorId;
        let candidatos = candidatosPorTipo;
        const generico = aliado ? ['aliado'] : ['inimigo', 'adversario', 'criatura'];
        if (generico.includes(alvoTexto)) candidatos = candidatos.filter(item => item.vida > 0 && (!aliado || item.id !== atorId));
        else candidatos = candidatos.filter(item => [item.id, item.origem_id, item.nome].some(nome => normalizarAcao(nome) === alvoTexto || limpar(nome) === alvoTexto));
        if (candidatos.length !== 1) throw new Error(candidatos.length ? 'Alvo ambíguo; informe o identificador.' : 'Alvo não identificado neste ambiente.');
        return candidatos[0].id;
    }
    if (comando === '/atacar' || (!comando && /^(ataco|atacar|ataque|golpeio)\b/.test(semInicio))) {
        acao.tipo = 'ataque'; acao.alvo_id = encontrarAlvo(comando ? conteudo : semInicio.replace(/^\S+\s*/, ''), false);
    } else if (comando === '/defender' || (!comando && /^(me )?(defendo|defender)$/.test(semInicio))) acao.tipo = 'defesa';
    else if (comando === '/esperar' || (!comando && /^(espero|aguardo)( um turno)?$/.test(semInicio))) acao.tipo = 'espera';
    else if (comando === '/descansar' || (!comando && /^descanso$/.test(semInicio))) acao.tipo = 'descanso';
    else if (comando === '/fugir' || (!comando && /^(fujo|fugir)( do combate)?$/.test(semInicio))) acao.tipo = 'fuga';
    else if (comando === '/aproximar' || (!comando && /^(me )?aproximo\b/.test(semInicio))) {
        acao.tipo = 'aproximacao'; acao.alvo_id = encontrarAlvo(comando ? conteudo : semInicio.replace(/^(me )?aproximo\s*/, ''), false);
    } else if (comando === '/mover' || (!comando && /^(me )?movo\b/.test(semInicio))) {
        const valor = comando ? conteudo : semInicio.replace(/^(me )?movo(?: para)?(?: a)?(?: posicao)?\s*/, '').replace(/\s*(m|metros)$/, '');
        if (!/^\d+$/.test(valor)) throw new Error('Posição inválida.');
        acao.tipo = 'movimento'; acao.posicao = Number(valor);
    } else if (comando === '/usar' || comando === '/preparar' || (!comando && /^(uso|usar|utilizo|lanco|curo|preparo)\b/.test(semInicio))) {
        let referencia = normalizarAcao(comando ? conteudo : semInicio.replace(/^\S+\s*/, ''));
        const aliases = habilidade => [...new Set([normalizarAcao(habilidade.id), normalizarAcao(habilidade.nome), ...(habilidade.id === 'projetil' ? ['projetil'] : [])])].sort((a, b) => b.length - a.length);
        let candidatas = participante.ficha.habilidades.filter(habilidade => aliases(habilidade).some(nome => ` ${referencia} `.includes(` ${nome} `)));
        const curar = !comando && semInicio.startsWith('curo ');
        if (!candidatas.length && curar) candidatas = participante.ficha.habilidades.filter(item => item.categoria === 'suporte');
        if (candidatas.length !== 1) throw new Error(candidatas.length ? 'Habilidade ambígua; informe o identificador.' : 'Habilidade não identificada entre as selecionadas.');
        const habilidade = candidatas[0];
        for (const alias of aliases(habilidade)) referencia = ` ${referencia} `.replace(` ${alias} `, ' ').trim();
        referencia = referencia.replace(/\b(meu|minha|com|habilidade|poder)\b/g, ' ').replace(/\s+/g, ' ').trim();
        referencia = referencia.replace(/^(o|a)\s+/, '');
        if (!comando && ['o', 'a'].includes(referencia)) referencia = '';
        acao.tipo = comando === '/preparar' || semInicio.startsWith('preparo ') ? 'preparacao' : 'habilidade';
        acao.habilidade_id = habilidade.id;
        if (acao.tipo === 'preparacao') { if (referencia) throw new Error('Preparação não recebe alvo.'); }
        else if (habilidade.categoria === 'mobilidade') {
            referencia = referencia.replace(/^(para )?(posicao )?/, '').replace(/ (m|metros)$/, '');
            if (!/^\d+$/.test(referencia)) throw new Error('Posição de destino inválida.');
            acao.posicao = Number(referencia);
        } else if (habilidade.categoria === 'utilitaria') {
            if (!['', 'aqui', 'ambiente', 'neste ambiente'].includes(referencia)) throw new Error('Habilidade utilitária se aplica ao ambiente atual.');
        } else acao.alvo_id = encontrarAlvo(referencia, ['defensiva', 'suporte'].includes(habilidade.categoria));
    } else throw new Error('Ação mecânica não identificada; informe a habilidade e o alvo.');
    if (comando && ['defesa', 'espera', 'descanso', 'fuga'].includes(acao.tipo) && conteudo) throw new Error('Esta ação não recebe argumentos.');
    return acao;
}

module.exports = { interpretarAcaoMecanica };
