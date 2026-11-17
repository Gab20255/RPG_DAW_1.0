const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { ambienteTeste, cliente } = require('./helpers');

function evento(socket, name, predicate = () => true) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Sem evento ${name}`)); }, 5000);
        function listener(data) { if (!predicate(data)) return; clearTimeout(timer); socket.off(name, listener); resolve(data); }
        socket.on(name, listener);
    });
}
const ack = (socket, name, body) => new Promise((resolve, reject) => socket.timeout(5000).emit(name, body, (error, result) => error ? reject(error) : resolve(result)));

test('dois usuários: lobby, ficha, prontidão, ações, reconexão e recuperação de erro 429', async () => {
    const env = await ambienteTeste(); const sockets = [];
    try {
        const a = cliente(env.url), b = cliente(env.url), outsider = cliente(env.url);
        const page = await fetch(env.url); assert.equal(page.status, 200); assert.match(await page.text(), /Entre Mundos/);
        assert.equal((await a.request('/api/salas')).status, 401);
        for (const [client, name] of [[a,'ana'],[b,'bruno'],[outsider,'visitante']]) {
            assert.equal((await client.request('/api/autenticacao/cadastro', { username:name, email:`${name}@example.com`, senha:'teste-seguro-123' })).status, 201);
            assert.equal((await client.request('/api/autenticacao/login', { login:name, senha:'teste-seguro-123' })).status, 200);
        }
        const created = await a.request('/api/salas', { titulo:'Floresta de teste', historia:'Uma aventura medieval na floresta.', tom:'Exploração' });
        assert.equal(created.status, 201); const id = created.data.sala.id, root = `/api/salas/${id}`;
        assert.equal((await outsider.request(root)).status, 404);
        assert.equal((await a.request(`${root}/iniciar`, {})).status, 409);
        assert.equal((await b.request('/api/salas/entrar', { codigo:created.data.sala.codigo })).status, 200);
        assert.equal((await a.request(`${root}/pronto`, { pronto:true })).status, 409);
        for (const [client, name] of [[a,'Ana'],[b,'Bruno']]) {
            const catalog = (await client.request(`${root}/catalogo`)).data;
            assert.equal(catalog.avatares.length, 60);
            const classe_id = catalog.classes[0].id;
            const descricao_visual = 'Orc de pele verde-acinzentada, presas inferiores e armadura de couro marrom.';
            const previa = await client.request(`${root}/avatar/previa`, { classe_id, descricao_visual });
            assert.equal(previa.data.selecao, 'ia');
            assert.equal(previa.data.avatar.id, 'P08');
            if (client === a) {
                for (const motivo of ['falha429', 'id inválido']) {
                    const alternativa = await client.request(`${root}/avatar/previa`, { classe_id, descricao_visual: `${descricao_visual} ${motivo}` });
                    assert.equal(alternativa.status, 200);
                    assert.equal(alternativa.data.selecao, 'local');
                    assert.equal(alternativa.data.avatar.id, 'P08');
                }
                const imagem = await fetch(`${env.url}${previa.data.avatar.url}`);
                assert.equal(imagem.headers.get('content-type'), 'image/jpeg');
                await imagem.arrayBuffer();
            }
            const avatar_id = client === a ? previa.data.avatar.id : 'medieval_guardiao';
            const ficha = { nome:name, classe_id, ...(catalog.racas.length ? { raca_id:catalog.racas[0].id } : {}), descricao_visual, habilidades_ids:catalog.habilidades.filter(h=>h.disponivel).slice(0,2).map(h=>h.id), avatar_id };
            const criada = await client.request(`${root}/personagem`, ficha);
            assert.equal(criada.status, 201);
            assert.equal(criada.data.campanha.participantes.find(p => p.ficha.nome === name).ficha.avatar_id, avatar_id);
            assert.equal((await client.request(`${root}/pronto`, { pronto:true })).status, 200);
        }
        assert.equal((await a.request(`${root}/acoes`, { acao:'/observar', turno_esperado:0 })).status, 409);
        assert.equal((await b.request(`${root}/iniciar`, {})).status, 403);
        for (const client of [a,b]) {
            const socket = io(env.url, { extraHeaders:{ Cookie:client.cookie() }, transports:['websocket'], autoConnect:false }); sockets.push(socket);
            const connected = evento(socket,'connect'); socket.connect(); await connected;
            assert.equal((await ack(socket,'sala:acompanhar',{sala_id:id})).ok,true);
        }
        const started = evento(sockets[1], 'sala:atualizada', d=>d.sala.etapa==='em_andamento');
        assert.equal((await a.request(`${root}/iniciar`, {})).status, 200); await started;
        assert.equal((await outsider.request('/api/salas/entrar',{codigo:created.data.sala.codigo})).status,409);
        const update = evento(sockets[1],'campanha:atualizada', d=>d.campanha.turno===1);
        const action = await a.request(`${root}/acoes`,{acao:'/observar',turno_esperado:0}); assert.equal(action.status,200); await update;
        assert.equal((await b.request(`${root}/acoes`,{acao:'/observar',turno_esperado:0})).status,409);
        const failed = await b.request(`${root}/acoes`,{acao:'/teste inteligencia falha429',turno_esperado:1});
        assert.equal(failed.status,429); assert.equal(env.rolagens(),1);
        const pending = (await b.request(root)).data.campanha.pendente; assert.ok(pending.teste);
        assert.equal((await b.request(`${root}/descartar`,{pedido_id:pending.id})).status,409);
        assert.equal((await a.request(`${root}/repetir`,{pedido_id:pending.id})).status,409);
        assert.equal((await b.request(`${root}/repetir`,{pedido_id:pending.id})).status,200);
        assert.equal(env.rolagens(),1);
        const beforeTravel = (await a.request(root)).data.campanha;
        const destination = beforeTravel.mundo.ambientes.find(p=>p.id===beforeTravel.ambiente_id).conexoes_ids[0];
        assert.equal((await a.request(`${root}/acoes`,{acao:`/ir ${destination}`,turno_esperado:2})).status,200);
        sockets[1].disconnect(); const reconnected = evento(sockets[1],'connect'); sockets[1].connect(); await reconnected;
        const snapshot = await ack(sockets[1],'sala:acompanhar',{sala_id:id});
        assert.equal(snapshot.campanha.turno,3); assert.equal(snapshot.campanha.ambiente_id,destination);
        const retratos = snapshot.campanha.participantes.map(p => p.ficha.avatar_url);
        assert.deepEqual(retratos, ['/avatares/P08.jpeg', '/avatares/v1/medieval_guardiao.svg']);
        assert.equal((await b.request(`${root}/historico`)).data.total,3);
        assert.equal((await b.request('/api/autenticacao/sessao')).status,200);
        const revoked = evento(sockets[1],'sessao:encerrada'); await b.request('/api/autenticacao/logout',{}); await revoked;
        assert.equal((await b.request(root)).status,401);
    } finally { sockets.forEach(s=>s.disconnect()); await env.fechar(); }
});
