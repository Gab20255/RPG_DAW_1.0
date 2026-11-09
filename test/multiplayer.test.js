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
            const ficha = { nome:name, classe_id:catalog.classes[0].id, ...(catalog.racas.length ? { raca_id:catalog.racas[0].id } : {}), descricao_visual:'Armadura simples e cabelos curtos.', habilidades_ids:catalog.habilidades.filter(h=>h.disponivel).slice(0,2).map(h=>h.id), avatar_id:catalog.avatares[0].id };
            assert.equal((await client.request(`${root}/personagem`, ficha)).status, 201);
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
        assert.equal((await b.request(`${root}/historico`)).data.total,3);
        assert.equal((await b.request('/api/autenticacao/sessao')).status,200);
        const revoked = evento(sockets[1],'sessao:encerrada'); await b.request('/api/autenticacao/logout',{}); await revoked;
        assert.equal((await b.request(root)).status,401);
    } finally { sockets.forEach(s=>s.disconnect()); await env.fechar(); }
});
