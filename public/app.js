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
function searchText(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function buildCharacterForm() {
    const catalog = state.catalog;
    $('#class-select').innerHTML = catalog.classes.map(c => option(c.id, c.nome)).join('');
    $('#race-select').innerHTML = catalog.racas.length ? catalog.racas.map(r => option(r.id, r.nome)).join('') : option('', 'Habitante do mundo');
    $('#skills-label').textContent = `Escolha ${catalog.regras.habilidades_por_personagem} habilidades`;
    $('#skill-options').innerHTML = catalog.habilidades.filter(h => h.disponivel).map(h => `<label class="skill-option"><input type="checkbox" name="habilidades_ids" value="${escapeHtml(h.id)}"><span>${escapeHtml(h.nome)}<small>${escapeHtml(h.descricao)} · Energia: ${escapeHtml(h.custoRecurso)}</small></span></label>`).join('');
    const themes = new Map(catalog.avatares.map(avatar => [avatar.base_id, avatar.tema]));
    $('#avatar-theme').innerHTML = option('', 'Todos os temas') + [...themes].map(([id, name]) => option(id, name)).join('');
    $('#avatar-options').innerHTML = catalog.avatares.map(avatar => {
        const search = searchText(`${avatar.id} ${avatar.nome} ${avatar.descricao}`);
        return `<label class="avatar-option" data-theme="${escapeHtml(avatar.base_id)}" data-search="${escapeHtml(search)}">
            <input type="radio" name="avatar_id" value="${escapeHtml(avatar.id)}" required>
            <img src="${escapeHtml(safeImage(avatar.url))}" alt="${escapeHtml(avatar.descricao)}" loading="lazy">
            <span>${escapeHtml(avatar.nome)}</span>
        </label>`;
    }).join('');
    updateClass();
    filterAvatars();
}
function showAvatarSelection() {
    const input = $('#avatar-options input:checked');
    const avatar = state.catalog.avatares.find(item => item.id === input?.value);
    const outsideFilter = input?.closest('label').hidden;
    $('#avatar-selected').textContent = avatar
        ? `Selecionado: ${avatar.nome}${outsideFilter ? ' (fora do filtro atual)' : ''}`
        : 'Selecione um retrato.';
}
function filterAvatars() {
    const grid = $('#avatar-options');
    const theme = $('#avatar-theme').value;
    const terms = searchText($('#avatar-search').value).split(' ').filter(Boolean);
    let visible = 0;
    // Ocultar a opção mantém o rádio selecionado no formulário quando o jogador muda o filtro.
    for (const card of grid.children) {
        card.hidden = Boolean(theme && card.dataset.theme !== theme) || !terms.every(term => card.dataset.search.includes(term));
        if (!card.hidden) visible++;
    }
    grid.hidden = visible === 0;
    grid.scrollTop = 0;
    $('#avatar-count').textContent = visible
        ? `${visible} ${visible === 1 ? 'retrato' : 'retratos'}`
        : 'Nenhum retrato encontrado. Tente outros filtros.';
    $('#clear-avatar-filters').hidden = !theme && !$('#avatar-search').value;
    showAvatarSelection();
}
function clearAvatarFilters() {
    $('#avatar-search').value = '';
    $('#avatar-theme').value = '';
    filterAvatars();
}
function selectAvatar(id) {
    const input = [...$('#avatar-options').querySelectorAll('input')].find(item => item.value === id);
    if (input) input.checked = true;
    showAvatarSelection();
    return input;
}
function attributes(values) { return Object.entries(values || {}).map(([name, value]) => `<span class="attribute">${escapeHtml(name)} <strong>${escapeHtml(value)}</strong></span>`).join(''); }
function updateClass() { const current = state.catalog.classes.find(c => c.id === $('#class-select').value); $('#class-description').textContent = current.descricao; $('#class-attributes').innerHTML = attributes(current.atributos); selectAvatar(current.avatar_sugerido_id); }
function characterCard(ficha, inventarioEmSeparado = false) {
    const itens = ficha.inventario.map(item => `<li><strong>${escapeHtml(item.nome)}</strong><small> — ${escapeHtml(item.descricao)}</small></li>`);
    const habilidades = ficha.habilidades.map(habilidade => `<li>${escapeHtml(habilidade.nome)}<small> · ${escapeHtml(habilidade.custoRecurso)} energia</small></li>`);
    return `<div class="character-header">
        <img class="portrait" src="${escapeHtml(safeImage(ficha.avatar_url))}" alt="Retrato de ${escapeHtml(ficha.nome)}">
        <div><h3>${escapeHtml(ficha.nome)}</h3><small>${escapeHtml(ficha.classe)} · ${escapeHtml(ficha.raca)}</small></div>
        </div>
        <div class="meter">
            <label>Vida <span>${ficha.vida} / ${ficha.vida_max}</span></label>
            <progress aria-label="Vida" max="${ficha.vida_max}" value="${ficha.vida}"></progress>
        </div>
        <div class="meter energy">
            <label>Energia <span>${ficha.energia} / ${ficha.energia_max}</span></label>
            <progress aria-label="Energia" max="${ficha.energia_max}" value="${ficha.energia}"></progress>
        </div>
        <div class="attributes">${attributes(ficha.atributos)}</div>
        <h3>Habilidades</h3><ul class="inventory">${habilidades.join('')}</ul>
        ${inventarioEmSeparado ? '' : `<h3>Inventário</h3><ul class="inventory">${itens.join('') || '<li>Nenhum item.</li>'}</ul>`}`;
}
function renderInventory(ficha) {
    const target = $('#my-inventory');
    const itens = ficha?.inventario || [];
    const key = JSON.stringify([ficha?.id, itens]);
    if (target.dataset.key === key) return;
    target.dataset.key = key;
    target.innerHTML = itens.map(item => {
        const etiquetas = [item.tipo, item.raridade].filter(Boolean).map(escapeHtml);
        return `<details class="inventory-entry">
            <summary><strong>${escapeHtml(item.nome)}</strong><small>${etiquetas.join(' · ')}</small></summary>
            <div class="inventory-details">
                <p>${escapeHtml(item.descricao)}</p>
                ${item.efeito ? `<p><strong>Efeito</strong> ${escapeHtml(item.efeito)}</p>` : ''}
            </div>
        </details>`;
    }).join('') || '<p class="muted">Nenhum item no inventário.</p>';
}
function renderParty(sala, campanha) {
    $('#game-members').innerHTML = sala.membros.map(membro => {
        const ficha = campanha.participantes.find(p => p.id === membro.participante_id)?.ficha;
        const nome = ficha?.nome || membro.username;
        const avatar = safeImage(ficha?.avatar_url);
        const retrato = avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : `<span class="party-initial" aria-hidden="true">${escapeHtml(nome[0]?.toUpperCase())}</span>`;
        const voce = membro.usuario_id === state.user.id;
        return `<li class="party-token${voce ? ' party-token--you' : ''}">
            <span class="party-portrait">${retrato}</span>
            <span class="party-info"><strong>${escapeHtml(nome)}</strong><small>${ficha ? `${ficha.vida} de ${ficha.vida_max} PV` : 'Sem ficha'}${voce ? ' · Você' : ''}</small></span>
        </li>`;
    }).join('');
}
function renderSceneArt(scene) {
    const imagem = $('#scene-image');
    const url = safeImage(scene?.imagem_url);
    if (imagem.dataset.url === url) return;
    imagem.dataset.url = url;
    imagem.hidden = true;
    if (url) imagem.src = url;
    else imagem.removeAttribute('src');
}
function renderRoom() {
    const sala = state.room, campanha = state.campaign; if (!sala || !campanha) return;
    $('#room-title').textContent = sala.nome; $('#room-theme').textContent = campanha.mundo.tom; $('#copy-code').textContent = sala.codigo;
    $('#room-stage').textContent = !sala.ativa ? 'Sala encerrada' : sala.etapa === 'preparacao' ? 'Preparação' : 'Em aventura';
    const lobby = sala.ativa && sala.etapa === 'preparacao'; $('#lobby').hidden = !lobby; $('#game').hidden = lobby;
    $('#room').classList.toggle('room-playing', !lobby);
    const me = sala.membros.find(m => m.usuario_id === state.user.id), ficha = campanha.participantes.find(p => p.id === me?.participante_id)?.ficha;
    const members = sala.membros.map(m => { const character = campanha.participantes.find(p => p.id === m.participante_id)?.ficha; return `<div class="member">${character ? `<img src="${escapeHtml(safeImage(character.avatar_url))}" alt="">` : '<span class="brand-mark">◇</span>'}<div class="member-info"><strong>${escapeHtml(character?.nome || m.username)}</strong><small>${escapeHtml(m.username)}${m.usuario_id === sala.host_id ? ' · anfitrião' : ''}</small></div><span class="badge">${m.pronto ? 'Pronto' : character ? 'Preparando' : 'Sem ficha'}</span></div>`; }).join('');
    $('#lobby-members').innerHTML = members;
    if (!lobby) renderParty(sala, campanha);
    $('#character-form').hidden = !!ficha; $('#character-saved').hidden = !ficha;
    if (ficha) {
        if (lobby) $('#character-saved').innerHTML = characterCard(ficha);
        else $('#my-character').innerHTML = characterCard(ficha, true);
    } else $('#my-character').textContent = 'Você não possui uma ficha nesta sala.';
    if (!lobby) renderInventory(ficha);
    $('#opening').textContent = campanha.abertura;
    $('#ready').textContent = me?.pronto ? 'Cancelar prontidão' : 'Estou pronto';
    $('#ready-description').textContent = `${sala.preparacao.jogadores_prontos} de ${sala.membros.length} jogadores prontos. São necessários pelo menos ${sala.preparacao.minimo_jogadores} jogadores com ficha.`;
    $('#start-game').hidden = sala.host_id !== state.user.id;
    const scene = campanha.mundo.ambientes.find(a => a.id === campanha.ambiente_id);
    $('#scene-name').textContent = scene?.nome || 'Local desconhecido'; $('#scene-description').textContent = scene?.descricao || '';
    if (!lobby) renderSceneArt(scene);
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
    renderHistory({ preservePosition: older });
}
function historyNearBottom() {
    const history = $('#history');
    return history.scrollHeight - history.scrollTop - history.clientHeight < 48;
}
function updateHistoryNavigation() {
    $('#latest-history').hidden = historyNearBottom();
    $('#older-history').hidden = state.historyStart === 0;
}
function sceneEntry(scene) {
    const { mundo, participantes } = state.campaign;
    const author = participantes.find(item => item.id === scene.participante_id)?.ficha.nome || 'Grupo';
    const place = mundo.ambientes.find(item => item.id === scene.ambiente_id)?.nome;
    const action = scene.tipo === 'transicao' && place ? `Ir para ${place}`
        : scene.acao === '/observar' ? 'Observar o local' : scene.acao;
    const test = scene.teste;
    const entry = document.createElement('article');
    entry.className = 'scene-entry';
    entry.dataset.sceneId = scene.id;
    entry.innerHTML = `<header class="scene-entry-heading">
        <span>Turno ${scene.turno} · ${escapeHtml(author)}</span>
        ${place ? `<span>${escapeHtml(place)}</span>` : ''}
        </header>
        <p class="action">${escapeHtml(action)}</p>
        ${test ? `<p class="result ${test.sucesso ? 'result--success' : 'result--failure'}">
            <strong>${test.sucesso ? 'Sucesso' : 'Falha'}</strong> · D20 ${test.d20} ${test.bonus < 0 ? '−' : '+'} ${Math.abs(test.bonus)} = ${test.total}</p>` : ''}
        ${scene.resultado ? `<p class="result">${escapeHtml(scene.resultado.resumo)}</p>` : ''}
        <p class="scene-narration">${escapeHtml(scene.narracao)}</p>
        ${scene.exige_resolucao_mecanica ? '<small>Esta intenção ainda exige resolução pelas regras do jogo.</small>' : ''}`;
    return entry;
}
function renderHistory({ preservePosition = false } = {}) {
    const target = $('#history');
    const key = `${state.generation}:${state.campaign.id}`;
    const reset = target.dataset.key !== key;
    const followLatest = reset || (!preservePosition && historyNearBottom());
    if (reset) {
        target.dataset.key = key;
        target.innerHTML = `<article class="scene-entry scene-opening">
            <header class="scene-entry-heading">Mestre · Abertura</header>
            <p class="scene-narration">${escapeHtml(state.campaign.abertura)}</p>
        </article>`;
    }

    const top = target.getBoundingClientRect().top;
    const anchor = followLatest ? null : [...target.children].find(entry => entry.getBoundingClientRect().bottom > top);
    const anchorPosition = anchor?.getBoundingClientRect().top;
    const scenes = [...state.scenes.values()].sort((a, b) => a.turno - b.turno);
    let cursor = target.firstElementChild.nextElementSibling;
    for (const scene of scenes) {
        if (cursor?.dataset.sceneId === scene.id) cursor = cursor.nextElementSibling;
        else target.insertBefore(sceneEntry(scene), cursor);
    }
    if (followLatest) target.scrollTop = target.scrollHeight;
    else if (anchor) target.scrollTop += anchor.getBoundingClientRect().top - anchorPosition;
    updateHistoryNavigation();
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
$('#scene-image').onload = event => { event.currentTarget.hidden = false; };
$('#scene-image').onerror = event => { event.currentTarget.hidden = true; };
$('#class-select').onchange = updateClass;
$('#avatar-search').oninput = filterAvatars;
$('#avatar-search').onkeydown = event => {
    if (event.key === 'Enter' && !event.isComposing) event.preventDefault();
};
$('#avatar-theme').onchange = filterAvatars;
$('#avatar-options').onchange = showAvatarSelection;
$('#clear-avatar-filters').onclick = () => {
    clearAvatarFilters();
    $('#avatar-search').focus();
};
$('#suggest-avatar').onclick = () => run(async () => {
    const classe_id = $('#class-select').value;
    const raca_id = $('#race-select').value;
    const descricao_visual = $('#character-form [name="descricao_visual"]').value;
    const avatarAnterior = $('#avatar-options input:checked')?.value;
    const { avatar, selecao } = await api(`/salas/${state.room.id}/avatar/previa`, {
        classe_id, descricao_visual, ...(raca_id ? { raca_id } : {}),
    });
    if (classe_id !== $('#class-select').value || raca_id !== $('#race-select').value
        || descricao_visual !== $('#character-form [name="descricao_visual"]').value
        || avatarAnterior !== $('#avatar-options input:checked')?.value) return;
    const card = selectAvatar(avatar.id)?.closest('label');
    const outsideFilter = card?.hidden;
    if (outsideFilter) clearAvatarFilters();
    card?.scrollIntoView({ block: 'nearest' });
    const origem = selecao === 'local' ? ' Seleção pelo catálogo local.' : '';
    const filtros = outsideFilter ? ' Os filtros foram limpos para mostrar o retrato.' : '';
    notice(`Retrato sugerido: ${avatar.nome}.${origem}${filtros}`);
}, 'Buscando um retrato no catálogo…');
$('#character-form').onsubmit = event => { event.preventDefault(); const data = new FormData(event.target), body = Object.fromEntries(data); body.habilidades_ids = data.getAll('habilidades_ids'); if (!body.raca_id) delete body.raca_id; if (body.habilidades_ids.length !== state.catalog.regras.habilidades_por_personagem) { notice(`Escolha exatamente ${state.catalog.regras.habilidades_por_personagem} habilidades.`, true); return; } run(async () => { await api(`/salas/${state.room.id}/personagem`, body); await refreshRoom(); notice('Personagem salvo. Confirme quando estiver pronto.'); }); };
$('#ready').onclick = () => run(async () => { const me = state.room.membros.find(m => m.usuario_id === state.user.id); const { sala } = await api(`/salas/${state.room.id}/pronto`, { pronto: !me.pronto }); applyRoom(sala); renderRoom(); });
$('#start-game').onclick = () => run(async () => { const { sala } = await api(`/salas/${state.room.id}/iniciar`, {}); applyRoom(sala); renderRoom(); });
$('#action-form').onsubmit = event => { event.preventDefault(); run(() => sendAction($('#action-input').value.trim()), 'O mestre está preparando a narração…'); };
$('#observe').onclick = () => run(() => sendAction('/observar'), 'Observando o ambiente…');
for (const [selector, route] of [['#retry','repetir'], ['#discard','descartar']]) $(selector).onclick = () => run(async () => { const pending = state.campaign.pendente; const { campanha } = await api(`/salas/${state.room.id}/${route}`, { pedido_id: pending.id }); if ($('#action-input').value.trim() === pending.acao) $('#action-form').reset(); applyCampaign(campanha); renderRoom(); await loadHistory(); }, route === 'repetir' ? 'Retomando a cena pendente…' : 'Descartando a ação…');
$('#older-history').onclick = () => run(() => loadHistory(true));
$('#history').onscroll = updateHistoryNavigation;
$('#latest-history').onclick = () => {
    const history = $('#history');
    history.scrollTop = history.scrollHeight;
    history.focus({ preventScroll: true });
    updateHistoryNavigation();
};
run(async () => { try { const { usuario } = await api('/autenticacao/sessao'); await enterUser(usuario); } catch (error) { expireSession(); if (error.status !== 401) throw error; } });
