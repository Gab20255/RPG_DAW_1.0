const { AVATARES } = require('../data/avatares');
const { BASES_RPG } = require('../data/basesRpg');

function normalizar(texto) {
    return ` ${String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function correspondencias(texto, termos) {
    return termos.filter(termo => texto.includes(normalizar(termo))).length;
}

function baseDosAvatares(mundo) {
    if (AVATARES.some(avatar => avatar.base_id === mundo.origem?.base_id)) return mundo.origem.base_id;
    const contexto = normalizar(`${mundo.mundo.tema} ${mundo.mundo.tom}`);
    return [...BASES_RPG].sort((primeira, segunda) => correspondencias(contexto, segunda.palavras_chave) - correspondencias(contexto, primeira.palavras_chave))[0].id;
}

function apresentarAvatar(avatar) {
    return { id: avatar.id, nome: avatar.nome, descricao: avatar.descricao, base_id: avatar.base_id,
        tema: avatar.paleta.nome, url: avatar.url, origem: 'catalogo_local' };
}

function obterAvatar(id) {
    const avatar = AVATARES.find(item => item.id === id);
    if (!avatar) throw new Error('Avatar não encontrado no catálogo.');
    return apresentarAvatar(avatar);
}

function listarAvatares(mundo) {
    const base = baseDosAvatares(mundo);
    return [...AVATARES].sort((primeiro, segundo) => Number(segundo.base_id === base) - Number(primeiro.base_id === base)).map(apresentarAvatar);
}

function sugerirAvatar(pedido, mundo) {
    const classe = mundo.classes.find(item => item.id === pedido.classe_id);
    if (!classe) throw new Error('Classe inválida.');
    if (typeof pedido.descricao_visual !== 'string' || pedido.descricao_visual.trim().length > 1000) throw new Error('Descrição visual inválida.');
    const base = baseDosAvatares(mundo);
    const descricao = normalizar(pedido.descricao_visual);
    const contextoClasse = normalizar(`${classe.nome} ${classe.descricao}`);
    const candidatos = AVATARES.filter(avatar => avatar.base_id === base).map(avatar => ({ avatar,
        pontos: (mundo.origem?.tipo === 'base_pronta' && avatar.classe_id === classe.id ? 45 : 0)
            + correspondencias(contextoClasse, avatar.classes) * 10 + correspondencias(descricao, avatar.aparencia) * 30,
    }));
    candidatos.sort((primeiro, segundo) => segundo.pontos - primeiro.pontos);
    return apresentarAvatar(candidatos[0].avatar);
}

function selecionarAvatar(pedido, mundo) {
    return pedido.avatar_id === undefined ? sugerirAvatar(pedido, mundo) : obterAvatar(pedido.avatar_id);
}

function escaparTexto(texto) {
    return texto.replace(/[&<>"']/g, caractere => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[caractere]);
}

const SIMBOLOS = {
    espada: '<path d="M0-20 7-12 4 8H-4L-7-12ZM-11 9H11M0 9V21"/>',
    cristal: '<path d="M0-22 13-4 0 20-13-4ZM0-22V20M-13-4H13"/>',
    adaga: '<path d="M10-20 7 1-7 14-13 8 0-6ZM-16 6-3 19M-10 13-17 20"/>',
    folha: '<path d="M0 20V-2C-18-22-20 4 0 6M0 2C20-22 22 3 0 13"/>',
    escudo: '<path d="M0-20 16-13V1Q15 14 0 22Q-15 14-16 1V-13ZM0-10V11M-8 0H8"/>',
    chave: '<path d="M-4-4Q-20-9-12-22L-8-13 0-11 6-16 1-23Q19-17 8-5L-9 19Q-17 21-17 13Z"/>',
    bussola: '<circle r="20"/><path d="M8-13 4 5-9 14-4-5ZM0-25V-20M0 20V25M-25 0H-20M20 0H25"/>',
    lupa: '<circle cx="-4" cy="-6" r="13"/><path d="M6 4 20 20"/>',
    caderno: '<path d="M-15-20H14V20H-15ZM-8-20V20M-2-10H8M-2-2H8M-2 6H6"/>',
};

function desenharAvatar(avatar) {
    const { fundo, cor, roupa, detalhe } = avatar.paleta;
    const capuz = ['capuz', 'mascara'].includes(avatar.cabelo);
    const longo = ['longo', 'preso'].includes(avatar.cabelo);
    const cabeca = capuz
        ? `<path d="M137 273V190Q137 91 256 78Q375 91 375 190V273L325 321H187Z" fill="${roupa}"/><path d="M173 232Q159 129 256 108Q352 129 339 232L307 289H205Z" fill="#18242b"/>`
        : longo ? '<path d="M173 263 162 172Q158 86 256 84Q353 86 350 172L340 294 310 333H199Z" fill="#292932"/>' : '';
    const traje = avatar.traje === 'armadura'
        ? `<path d="M82 512 99 363 165 320 211 342H301L347 320 413 363 430 512Z" fill="${roupa}"/><path d="M107 354 171 324 188 387 88 411ZM405 354 341 324 324 387 424 411Z" fill="${cor}"/><path d="M190 365 256 387 322 365 305 480H207Z" fill="${fundo}" stroke="${cor}" stroke-width="5"/>`
        : `<path d="M78 512 99 378Q111 344 190 325H322Q401 344 413 378L434 512Z" fill="${avatar.traje === 'tunica' ? '#bbb9a9' : roupa}"/><path d="M190 325 224 343 256 401 288 343 322 325 343 368 307 383 256 512 205 383 169 368Z" fill="${avatar.traje === 'manto' ? fundo : cor}"/><path d="M256 402V512" stroke="${fundo}" stroke-width="5"/>`;
    const adorno = avatar.cabelo === 'oculos' ? `<g fill="${fundo}" fill-opacity=".5" stroke="${detalhe}" stroke-width="5"><rect x="192" y="192" width="51" height="32" rx="11"/><rect x="269" y="192" width="51" height="32" rx="11"/><path d="M243 204H269"/></g>`
        : avatar.cabelo === 'visor' ? `<path d="M182 179 330 182 321 223 191 223Z" fill="${cor}" fill-opacity=".88" stroke="${detalhe}" stroke-width="4"/><path d="M201 191H272M201 201H238" stroke="${fundo}" stroke-width="4"/>`
            : avatar.cabelo === 'mascara' ? `<path d="M191 230 256 217 321 230 304 280 256 302 208 280Z" fill="${roupa}" stroke="${cor}" stroke-width="3"/><path d="M233 243H279M233 253H279M238 263H274" stroke="${detalhe}" stroke-width="3"/>`
                : avatar.cabelo === 'cicatriz' ? '<path d="M291 175 282 225 294 248" fill="none" stroke="#efd0b7" stroke-width="4"/>' : '';
    const cenario = avatar.base_id === 'ficcao_cientifica'
        ? `<path d="M44 340V95H135M468 340V95H377M60 125H95M417 125H452M60 145H80M432 145H452" fill="none" stroke="${cor}" stroke-opacity=".4" stroke-width="3"/>`
        : avatar.base_id === 'investigacao_contemporanea'
            ? `<path d="M35 330V201H91V156H129V330M389 330V183H443V239H476V330" fill="none" stroke="${cor}" stroke-opacity=".3" stroke-width="4"/>`
            : `<path d="M41 330 68 252 95 302 118 238M394 265 422 209 471 330" fill="none" stroke="${cor}" stroke-opacity=".3" stroke-width="3"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="titulo descricao">
<title id="titulo">${escaparTexto(avatar.nome)}</title><desc id="descricao">${escaparTexto(avatar.descricao)} Retrato genérico do catálogo.</desc>
<defs><radialGradient id="luz"><stop stop-color="${roupa}"/><stop offset="1" stop-color="${fundo}"/></radialGradient><linearGradient id="rosto" x2="1" y2="1"><stop stop-color="${avatar.pele}"/><stop offset="1" stop-color="${avatar.pele}" stop-opacity=".72"/></linearGradient><clipPath id="quadro"><rect width="512" height="512" rx="36"/></clipPath></defs>
<g clip-path="url(#quadro)"><rect width="512" height="512" fill="url(#luz)"/><circle cx="256" cy="220" r="171" fill="none" stroke="${cor}" stroke-opacity=".3"/><circle cx="256" cy="220" r="151" fill="none" stroke="${cor}" stroke-opacity=".12"/>
${cenario}${cabeca}<path d="M226 263H286V328L308 341 256 381 204 341 226 328Z" fill="${avatar.pele}"/>
${traje}<path d="M185 172Q181 116 256 116Q331 116 327 172L322 239Q316 283 256 306Q196 283 190 239Z" fill="url(#rosto)"/>
<path d="M191 185Q179 142 203 117Q237 90 281 109Q338 115 328 181L307 160 291 136Q254 169 215 156Z" fill="#292932"/>
<path d="M200 190 232 186M280 186 310 191" stroke="#49392f" stroke-width="6" stroke-linecap="round"/>
<path d="M207 207H226M286 207H305" stroke="#24242a" stroke-width="5" stroke-linecap="round"/>
<path d="M258 212 248 238 261 242" fill="none" stroke="#785543" stroke-width="4" stroke-linecap="round"/><path d="M239 266Q256 274 273 266" fill="none" stroke="#694638" stroke-width="4" stroke-linecap="round"/>
${adorno}${avatar.cabelo === 'preso' ? '<path d="M326 132Q376 127 360 190L343 221 336 176Z" fill="#292932"/>' : ''}
<circle cx="256" cy="417" r="35" fill="${fundo}" stroke="${cor}" stroke-width="3"/><g transform="translate(256 417)" fill="none" stroke="${detalhe}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${SIMBOLOS[avatar.simbolo]}</g>
<rect x="15" y="15" width="482" height="482" rx="25" fill="none" stroke="${cor}" stroke-opacity=".45" stroke-width="2"/></g></svg>`;
}

const IMAGENS = new Map(AVATARES.map(avatar => [avatar.id, desenharAvatar(avatar)]));

function obterImagemAvatar(id) { return IMAGENS.get(id) || null; }

module.exports = { listarAvatares, sugerirAvatar, selecionarAvatar, obterAvatar, obterImagemAvatar };
