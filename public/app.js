'use strict';
const $ = selector => document.querySelector(selector);
const state = { user: null, room: null, campaign: null, catalog: null, socket: null, synced: false, busy: false, scenes: new Map(), historyStart: 0, screen: 'auth', generation: 0 };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const safeImage = url => typeof url === 'string' && /^\/avatares\/[a-zA-Z0-9_/.\-]+$/.test(url) ? url : '';
function notice(message = '', error = false) { $('#notice').textContent = message; $('#notice').hidden = !message; $('#notice').classList.toggle('error', error); }
function show(screen) { state.screen = screen; for (const id of ['auth', 'dashboard', 'room']) $(`#${id}`).hidden = id !== screen; }
function localKey() { return `rpg:sala:${state.user.id}`; }
function rememberedRoom(value) { try { if (value === undefined) return localStorage.getItem(localKey()); if (value === null) localStorage.removeItem(localKey()); else localStorage.setItem(localKey(), value); } catch { /* Armazenamento opcional em navegadores privados. */ } }
function expireSession() {
    state.generation++; state.socket?.disconnect(); state.socket = null; state.synced = false; state.user = null; state.room = null; state.campaign = null; state.catalog = null;
    $('#username').textContent = ''; $('#logout').hidden = true; $('#connection').textContent = 'Entre para jogar'; show('auth');
}
async function api(path, body) {
    let response;
    try { response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new Error('Conexão interrompida. Aguarde a reconexão e confira o estado da sala antes de reenviar.'); }
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
        if (response.status === 401 && state.user) expireSession();
        const error = new Error(data.erro?.mensagem || 'Não foi possível concluir a operação.'); error.status = response.status; error.code = data.erro?.codigo; throw error;
    }
    return data;
}
async function run(task, message = '') {
    if (state.busy) return;
    state.busy = true; document.body.classList.add('busy'); notice(message); lockControls();
    try { await task(); if (message && $('#notice').textContent === message) notice(); }
    catch (error) {
        if (state.room && state.user) { try { await refreshRoom(); } catch { /* Mantém o erro original. */ } }
        notice(error.message + (error.status === 429 ? ' Aguarde um pouco antes de tentar novamente.' : ''), true);
    } finally { state.busy = false; document.body.classList.remove('busy'); lockControls(); }
}
function lockControls() {
    document.querySelectorAll('form button, #suggest-avatar, #refresh-rooms, #back, #logout, .room-entry, #copy-code, #older-history').forEach(el => { el.disabled = state.busy; });
    const room = state.room, campaign = state.campaign, me = room?.membros.find(m => m.usuario_id === state.user?.id);
    $('#ready').disabled = state.busy || !room?.ativa || !me?.personagem_id || room.etapa !== 'preparacao';
    $('#start-game').disabled = state.busy || !room?.preparacao.pronta_para_iniciar;
    const canAct = !state.busy && state.synced && !!state.socket?.connected && room?.ativa && room.etapa === 'em_andamento' && campaign?.estado !== 'concluida' && !campaign?.pendente;
    document.querySelectorAll('#action-form button, #action-input, #destinations button').forEach(el => { el.disabled = !canAct; });
    const mine = campaign?.pendente?.participante_id === `usuario_${state.user?.id}`;
    $('#retry').disabled = state.busy || !state.synced || !state.socket?.connected || !mine || !room?.ativa;
    $('#discard').disabled = $('#retry').disabled || !!campaign?.pendente?.teste || !!campaign?.pendente?.resultado;
    if (campaign) $('#action-help').textContent = !room?.ativa ? 'Esta sala foi encerrada.' : campaign.estado === 'concluida' ? 'Esta aventura foi concluída.' : !state.socket?.connected ? 'Reconectando ao grupo. Suas ações ficarão disponíveis após a sincronização.' : campaign.pendente ? 'Aguarde a conclusão da cena pendente.' : 'As ações e os resultados são compartilhados com todo o grupo.';
}
function applyRoom(room) { if (state.room?.id === room.id && room.revisao_preparacao < state.room.revisao_preparacao) return; state.room = room; }
function applyCampaign(campaign) { if (state.campaign?.id === campaign.id && campaign.revisao < state.campaign.revisao) return; state.campaign = campaign; }
function connect() {
    state.socket?.disconnect();
    const socket = io({ autoConnect: false }); state.socket = socket;
    socket.on('connect', () => {
        $('#connection').textContent = '● Conectado';
        if (state.room) followRoom().catch(error => notice(error.message, true));
        lockControls();
    });
    socket.on('disconnect', () => { state.synced = false; $('#connection').textContent = '○ Reconectando…'; lockControls(); });
    socket.on('connect_error', error => { $('#connection').textContent = '○ Sem conexão'; if (['SESSAO_INVALIDA', 'SESSAO_EXPIRADA', 'NAO_AUTENTICADO'].includes(error.data?.codigo)) expireSession(); else api('/autenticacao/sessao').catch(e => notice(e.message, true)); lockControls(); });
    socket.on('sessao:encerrada', () => { expireSession(); notice('Sua sessão terminou. Entre novamente.', true); });
    socket.on('sala:atualizada', ({ sala }) => { if (sala.id !== state.room?.id) return; applyRoom(sala); renderRoom(); });
    socket.on('campanha:atualizada', ({ sala_id, campanha }) => { if (sala_id !== state.room?.id) return; applyCampaign(campanha); renderRoom(); loadHistory().catch(error => notice(error.message, true)); });
    socket.connect();
}
function ack(event, body) { return new Promise((resolve, reject) => state.socket.timeout(15000).emit(event, body, (error, data) => error ? reject(new Error('A sala não respondeu. Tente atualizar a conexão.')) : data.ok ? resolve(data) : reject(new Error(data.erro?.mensagem || 'Falha na sincronização.')))); }
async function followRoom() {
    const generation = state.generation, id = state.room.id;
    const data = await ack('sala:acompanhar', { sala_id: id });
    if (generation !== state.generation || id !== state.room?.id) return;
    applyRoom(data.sala); applyCampaign(data.campanha); renderRoom(); await loadHistory();
    if (generation === state.generation && id === state.room?.id && state.socket?.connected) { state.synced = true; lockControls(); }
}
async function refreshRoom() {
    const id = state.room?.id, generation = state.generation; if (!id) return;
    const data = await api(`/salas/${id}`);
    if (generation !== state.generation || id !== state.room?.id) return;
    applyRoom(data.sala); applyCampaign(data.campanha); renderRoom(); await loadHistory();
}
async function loadRooms() {
    const generation = state.generation, { salas } = await api('/salas'); if (generation !== state.generation) return;
    $('#room-list').replaceChildren();
    if (!salas.length) { $('#room-list').textContent = 'Nenhuma aventura por aqui ainda. Crie uma sala ou entre com um código.'; return; }
    for (const sala of salas) {
        const button = document.createElement('button'); button.className = 'room-entry';
        button.innerHTML = `<strong>${escapeHtml(sala.nome)}</strong><span>${sala.membros.length} jogadores · ${sala.etapa === 'preparacao' ? 'Em preparação' : sala.ativa ? 'Em andamento' : 'Encerrada'}</span>`;
        button.onclick = () => run(() => openRoom(sala.id)); $('#room-list').append(button);
    }
}
async function dashboard() {
    if (state.busy) return;
    if (state.room && state.socket?.connected) state.socket.emit('sala:parar', { sala_id: state.room.id });
    state.generation++; state.room = null; state.campaign = null; state.catalog = null; rememberedRoom(null); show('dashboard'); await run(loadRooms);
}
async function enterUser(user) {
    state.user = user; $('#username').textContent = user.username; $('#logout').hidden = false; connect(); show('dashboard');
    await loadRooms(); const saved = rememberedRoom();
    if (saved && /^\d+$/.test(saved)) { try { await openRoom(Number(saved)); } catch (error) { if ([403, 404].includes(error.status)) rememberedRoom(null); notice(error.message, true); } }
}
async function openRoom(id) {
    const generation = ++state.generation; state.synced = false;
    if (state.room && state.socket?.connected) state.socket.emit('sala:parar', { sala_id: state.room.id });
    const [data, catalog] = await Promise.all([api(`/salas/${id}`), api(`/salas/${id}/catalogo`)]);
    if (generation !== state.generation) return;
    state.room = data.sala; state.campaign = data.campanha; state.catalog = catalog; state.scenes = new Map(); state.historyStart = Math.max(0, data.campanha.turno - 20);
    rememberedRoom(id); $('#character-form').reset(); $('#action-form').reset(); buildCharacterForm(); show('room'); renderRoom();
    if (state.socket?.connected) await followRoom(); else await loadHistory();
}
function option(id, name) { return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`; }
function buildCharacterForm() {
    const catalog = state.catalog;
    $('#class-select').innerHTML = catalog.classes.map(c => option(c.id, c.nome)).join('');
    $('#race-select').innerHTML = catalog.racas.length ? catalog.racas.map(r => option(r.id, r.nome)).join('') : option('', 'Habitante do mundo');
    $('#skills-label').textContent = `Escolha ${catalog.regras.habilidades_por_personagem} habilidades`;
    $('#skill-options').innerHTML = catalog.habilidades.filter(h => h.disponivel).map(h => `<label class="skill-option"><input type="checkbox" name="habilidades_ids" value="${escapeHtml(h.id)}"><span>${escapeHtml(h.nome)}<small>${escapeHtml(h.descricao)} · Energia: ${escapeHtml(h.custoRecurso)}</small></span></label>`).join('');
    $('#avatar-options').innerHTML = catalog.avatares.map(a => `<label class="avatar-option"><input type="radio" name="avatar_id" value="${escapeHtml(a.id)}" required><img src="${escapeHtml(safeImage(a.url))}" alt="${escapeHtml(a.descricao)}" loading="lazy"><span>${escapeHtml(a.nome)}</span></label>`).join('');
    updateClass();
}
function selectAvatar(id) { for (const input of document.querySelectorAll('[name="avatar_id"]')) input.checked = input.value === id; }
function attributes(values) { return Object.entries(values || {}).map(([name, value]) => `<span class="attribute">${escapeHtml(name)} <strong>${escapeHtml(value)}</strong></span>`).join(''); }
function updateClass() { const current = state.catalog.classes.find(c => c.id === $('#class-select').value); $('#class-description').textContent = current.descricao; $('#class-attributes').innerHTML = attributes(current.atributos); selectAvatar(current.avatar_sugerido_id); }
function characterCard(ficha) {
    return `<div class="character-header"><img class="portrait" src="${escapeHtml(safeImage(ficha.avatar_url))}" alt="Retrato de ${escapeHtml(ficha.nome)}"><div><h3>${escapeHtml(ficha.nome)}</h3><small>${escapeHtml(ficha.classe)} · ${escapeHtml(ficha.raca)}</small></div></div><div class="meter"><label>Vida <span>${ficha.vida} / ${ficha.vida_max}</span></label><progress aria-label="Vida" max="${ficha.vida_max}" value="${ficha.vida}"></progress></div><div class="meter energy"><label>Energia <span>${ficha.energia} / ${ficha.energia_max}</span></label><progress aria-label="Energia" max="${ficha.energia_max}" value="${ficha.energia}"></progress></div><div class="attributes">${attributes(ficha.atributos)}</div><h3>Habilidades</h3><ul class="inventory">${ficha.habilidades.map(h => `<li>${escapeHtml(h.nome)}<small> · ${escapeHtml(h.custoRecurso)} energia</small></li>`).join('')}</ul><h3>Inventário</h3><ul class="inventory">${ficha.inventario.map(i => `<li><strong>${escapeHtml(i.nome)}</strong><small> — ${escapeHtml(i.descricao)}</small></li>`).join('') || '<li>Nenhum item.</li>'}</ul>`;
}
function renderRoom() {
    const sala = state.room, campanha = state.campaign; if (!sala || !campanha) return;
    $('#room-title').textContent = sala.nome; $('#room-theme').textContent = campanha.mundo.tom; $('#copy-code').textContent = sala.codigo;
    $('#room-stage').textContent = !sala.ativa ? 'Sala encerrada' : sala.etapa === 'preparacao' ? 'Preparação' : 'Em aventura';
    const lobby = sala.ativa && sala.etapa === 'preparacao'; $('#lobby').hidden = !lobby; $('#game').hidden = lobby;
    const me = sala.membros.find(m => m.usuario_id === state.user.id), ficha = campanha.participantes.find(p => p.id === me?.participante_id)?.ficha;
    const members = sala.membros.map(m => { const character = campanha.participantes.find(p => p.id === m.participante_id)?.ficha; return `<div class="member">${character ? `<img src="${escapeHtml(safeImage(character.avatar_url))}" alt="">` : '<span class="brand-mark">◇</span>'}<div class="member-info"><strong>${escapeHtml(character?.nome || m.username)}</strong><small>${escapeHtml(m.username)}${m.usuario_id === sala.host_id ? ' · anfitrião' : ''}</small></div><span class="badge">${lobby ? m.pronto ? 'Pronto' : character ? 'Preparando' : 'Sem ficha' : character ? `${character.vida} PV` : 'Sem ficha'}</span></div>`; }).join('');
    $('#lobby-members').innerHTML = members; $('#game-members').innerHTML = members;
    $('#character-form').hidden = !!ficha; $('#character-saved').hidden = !ficha;
    if (ficha) { $('#character-saved').innerHTML = characterCard(ficha); $('#my-character').innerHTML = characterCard(ficha); } else $('#my-character').textContent = 'Você não possui uma ficha nesta sala.';
    $('#opening').textContent = campanha.abertura;
    $('#ready').textContent = me?.pronto ? 'Cancelar prontidão' : 'Estou pronto';
    $('#ready-description').textContent = `${sala.preparacao.jogadores_prontos} de ${sala.membros.length} jogadores prontos. São necessários pelo menos ${sala.preparacao.minimo_jogadores} jogadores com ficha.`;
    $('#start-game').hidden = sala.host_id !== state.user.id;
    const scene = campanha.mundo.ambientes.find(a => a.id === campanha.ambiente_id);
    $('#scene-name').textContent = scene?.nome || 'Local desconhecido'; $('#scene-description').textContent = scene?.descricao || '';
    $('#destinations').replaceChildren();
    for (const id of scene?.conexoes_ids || []) { const place = campanha.mundo.ambientes.find(a => a.id === id); if (!place) continue; const button = document.createElement('button'); button.textContent = `Ir para ${place.nome} →`; button.onclick = () => run(() => sendAction(`/ir ${id}`), 'O grupo segue para um novo local…'); $('#destinations').append(button); }
    $('#turn').textContent = `Turno ${campanha.turno}`;
    $('#objectives').innerHTML = campanha.objetivos.map(o => `<div class="objective">${escapeHtml(o.descricao)}<small>${escapeHtml(o.estado)}</small></div>`).join('');
    $('#pending').hidden = !campanha.pendente;
    const mine = campanha.pendente?.participante_id === me?.participante_id;
    $('#pending-text').textContent = campanha.pendente ? `Cena pendente: ${campanha.pendente.acao}. ${mine ? 'Se a narração falhar, tente novamente sem repetir a rolagem.' : 'Aguardando a narração ou a recuperação pelo autor da ação.'}` : '';
    $('#retry').hidden = !mine; $('#discard').hidden = !mine || !!campanha.pendente?.teste || !!campanha.pendente?.resultado;
    $('#ending').hidden = !campanha.desfecho; $('#ending').textContent = campanha.desfecho || '';
    renderHistory(); lockControls();
}
async function loadHistory(older = false) {
    const roomId = state.room?.id; if (!roomId) return;
    const generation = state.generation;
    let offset = older ? Math.max(0, state.historyStart - 20) : state.scenes.size ? Math.max(...[...state.scenes.values()].map(scene => scene.turno)) : Math.max(0, state.campaign.turno - 20);
    const start = offset;
    while (true) {
        const history = await api(`/salas/${roomId}/historico?limite=${older ? 20 : 100}&deslocamento=${offset}`);
        if (generation !== state.generation || roomId !== state.room?.id) return;
        for (const scene of history.cenas) state.scenes.set(scene.id, scene);
        offset += history.cenas.length;
        if (older || !history.cenas.length || offset >= history.total) break;
    }
    state.historyStart = Math.min(state.historyStart, start);
    renderHistory();
}
function renderHistory() {
    const target = $('#history'), nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
    const scenes = [...state.scenes.values()].sort((a,b) => a.turno - b.turno);
    const key = `${state.campaign?.id}:${scenes.map(s => s.id).join(',')}`;
    if (target.dataset.key === key) return; target.dataset.key = key;
    target.innerHTML = `<article class="scene-entry"><small>MESTRE · ABERTURA</small><p>${escapeHtml(state.campaign?.abertura)}</p></article>` + scenes.map(scene => {
        const name = state.campaign.participantes.find(p => p.id === scene.participante_id)?.ficha.nome || 'Grupo';
        return `<article class="scene-entry"><small>TURNO ${scene.turno} · ${escapeHtml(name)}</small><p class="action">${escapeHtml(scene.acao)}</p>${scene.teste ? `<p class="result">D20: ${scene.teste.d20} + ${scene.teste.bonus} = ${scene.teste.total} · ${scene.teste.sucesso ? 'Sucesso' : 'Falha'}</p>` : ''}${scene.resultado ? `<p class="result">${escapeHtml(scene.resultado.resumo)}</p>` : ''}<p>${escapeHtml(scene.narracao)}</p>${scene.exige_resolucao_mecanica ? '<small>Esta intenção ainda exige resolução pelas regras do jogo.</small>' : ''}</article>`;
    }).join('');
    $('#older-history').hidden = state.historyStart === 0;
    if (nearBottom) target.scrollTop = target.scrollHeight;
}
async function sendAction(action) {
    const id = state.room.id, generation = state.generation;
    const { campanha } = await api(`/salas/${id}/acoes`, { acao: action, turno_esperado: state.campaign.turno });
    if (generation !== state.generation) return;
    applyCampaign(campanha); $('#action-form').reset(); renderRoom(); await loadHistory();
}
$('#tab-login').onclick = () => { $('#login-form').hidden = false; $('#register-form').hidden = true; $('#tab-login').classList.add('active'); $('#tab-register').classList.remove('active'); notice(); };
$('#tab-register').onclick = () => { $('#login-form').hidden = true; $('#register-form').hidden = false; $('#tab-login').classList.remove('active'); $('#tab-register').classList.add('active'); notice(); };
$('#login-form').onsubmit = event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.target)); run(async () => { const { usuario } = await api('/autenticacao/login', body); event.target.reset(); await enterUser(usuario); }); };
$('#register-form').onsubmit = event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.target)); run(async () => { await api('/autenticacao/cadastro', body); event.target.reset(); $('#tab-login').click(); $('#login-form [name="login"]').value = body.username; notice('Conta criada. Entre com sua senha para começar.'); }); };
$('#logout').onclick = () => run(async () => { await api('/autenticacao/logout', {}); expireSession(); });
$('#home').onclick = event => { event.preventDefault(); if (state.user) dashboard(); };
$('#back').onclick = dashboard; $('#refresh-rooms').onclick = () => run(loadRooms);
$('#create-room').onsubmit = event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.target)); run(async () => { const { sala } = await api('/salas', body); await openRoom(sala.id); event.target.reset(); }, 'Preparando o mundo da sua aventura…'); };
$('#join-room').onsubmit = event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.target)); run(async () => { const { sala } = await api('/salas/entrar', body); await openRoom(sala.id); event.target.reset(); }); };
$('#copy-code').onclick = () => run(async () => { try { await navigator.clipboard.writeText(state.room.codigo); notice('Código copiado. Compartilhe com seu grupo.'); } catch { notice(`Código da sala: ${state.room.codigo}`); } });
$('#class-select').onchange = updateClass;
$('#suggest-avatar').onclick = () => run(async () => { const { avatar } = await api(`/salas/${state.room.id}/avatar/previa`, { classe_id: $('#class-select').value, descricao_visual: $('#character-form [name="descricao_visual"]').value }); selectAvatar(avatar.id); notice(`Retrato sugerido: ${avatar.nome}.`); });
$('#character-form').onsubmit = event => { event.preventDefault(); const data = new FormData(event.target), body = Object.fromEntries(data); body.habilidades_ids = data.getAll('habilidades_ids'); if (!body.raca_id) delete body.raca_id; if (body.habilidades_ids.length !== state.catalog.regras.habilidades_por_personagem) { notice(`Escolha exatamente ${state.catalog.regras.habilidades_por_personagem} habilidades.`, true); return; } run(async () => { await api(`/salas/${state.room.id}/personagem`, body); await refreshRoom(); notice('Personagem salvo. Confirme quando estiver pronto.'); }); };
$('#ready').onclick = () => run(async () => { const me = state.room.membros.find(m => m.usuario_id === state.user.id); const { sala } = await api(`/salas/${state.room.id}/pronto`, { pronto: !me.pronto }); applyRoom(sala); renderRoom(); });
$('#start-game').onclick = () => run(async () => { const { sala } = await api(`/salas/${state.room.id}/iniciar`, {}); applyRoom(sala); renderRoom(); });
$('#action-form').onsubmit = event => { event.preventDefault(); run(() => sendAction($('#action-input').value.trim()), 'O mestre está preparando a narração…'); };
$('#observe').onclick = () => run(() => sendAction('/observar'), 'Observando o ambiente…');
for (const [selector, route] of [['#retry','repetir'], ['#discard','descartar']]) $(selector).onclick = () => run(async () => { const pending = state.campaign.pendente; const { campanha } = await api(`/salas/${state.room.id}/${route}`, { pedido_id: pending.id }); if ($('#action-input').value.trim() === pending.acao) $('#action-form').reset(); applyCampaign(campanha); renderRoom(); await loadHistory(); }, route === 'repetir' ? 'Retomando a cena pendente…' : 'Descartando a ação…');
$('#older-history').onclick = () => run(() => loadHistory(true));
run(async () => { try { const { usuario } = await api('/autenticacao/sessao'); await enterUser(usuario); } catch (error) { expireSession(); if (error.status !== 401) throw error; } });
