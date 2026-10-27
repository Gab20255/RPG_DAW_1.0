const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { REGRAS, selecionarHabilidades } = require('../rules/habilidades');
const ATRIBUTOS = ['forca', 'destreza', 'inteligencia', 'carisma', 'constituicao', 'sabedoria'];

function calcularAtributos(classe) {
    let positivos = 0;
    const atributos = {};
    for (const chave of ATRIBUTOS) {
        const bonus = classe.bonus_atributos[chave];
        if (!Number.isInteger(bonus) || bonus < -2 || bonus > REGRAS.bonusMaximo) throw new Error('Os bônus desta classe excedem os limites do protótipo (-2 a +4).');
        positivos += Math.max(0, bonus);
        atributos[chave] = REGRAS.atributoBase + bonus;
    }
    if (positivos > REGRAS.somaBonusPositivosMaxima) throw new Error('A classe excede o orçamento de +6 em bônus positivos. Revise o JSON.');
    return atributos;
}

function texto(valor, campo, min, max) {
    if (typeof valor !== 'string' || valor.trim().length < min || valor.trim().length > max) throw new Error(`${campo} deve ter entre ${min} e ${max} caracteres.`);
    return valor.trim();
}

function criarPersonagem(pedido, mundo) {
    const campos = ['mundo_id', 'nome', 'classe_id', 'raca_id', 'descricao_visual', 'habilidades_ids'];
    if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido) || Object.keys(pedido).some((chave) => !campos.includes(chave))) throw new Error('Envie apenas nome, classe, povo, aparência e IDs de habilidades. Os números são calculados no servidor.');
    const classe = mundo.classes.find((item) => item.id === pedido.classe_id);
    if (!classe) throw new Error('Escolha uma classe deste mundo.');
    const raca = mundo.racas.find((item) => item.id === pedido.raca_id);
    if (mundo.racas.length && !raca) throw new Error('Escolha um povo deste mundo.');
    if (!mundo.racas.length && pedido.raca_id) throw new Error('Este mundo não possui povos selecionáveis.');
    const habilidades = selecionarHabilidades(pedido.habilidades_ids, REGRAS.nivelInicial, REGRAS.habilidadesIniciais);
    return {
        id: randomUUID(), mundo_id: pedido.mundo_id, mundo_nome: mundo.mundo.nome,
        nome: texto(pedido.nome, 'Nome', 2, 60), classe_id: classe.id, classe: classe.nome,
        raca_id: raca?.id || null, raca: raca?.nome || 'Habitante do mundo',
        descricao_visual: texto(pedido.descricao_visual, 'Descrição visual', 10, 1000),
        nivel: REGRAS.nivelInicial, vida: REGRAS.vidaInicial, vida_max: REGRAS.vidaInicial,
        energia: REGRAS.energiaInicial, energia_max: REGRAS.energiaInicial,
        atributos: calcularAtributos(classe), habilidades,
        inventario: classe.itens_iniciais_ids.map((id) => {
            const item = mundo.itens.find((candidato) => candidato.id === id);
            if (!item) throw new Error('Item inicial não encontrado no mundo.');
            return structuredClone(item);
        }),
        versao_regras: REGRAS.versao, criado_em: new Date().toISOString(),
    };
}

function validarPersonagem(ficha, mundo) {
    if (!ficha || typeof ficha.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(ficha.id)) throw new Error('Identificador da ficha inválido.');
    if (ficha.versao_regras !== REGRAS.versao) throw new Error('A ficha usa outra versão de regras. Recrie o personagem.');
    const original = criarPersonagem({ mundo_id: ficha.mundo_id, nome: ficha.nome, classe_id: ficha.classe_id, raca_id: ficha.raca_id,
        descricao_visual: ficha.descricao_visual, habilidades_ids: ficha.habilidades?.map((h) => h.id) }, mundo);
    for (const campo of ['classe', 'raca', 'nivel', 'vida', 'vida_max', 'energia', 'energia_max', 'atributos', 'habilidades', 'inventario']) {
        if (!isDeepStrictEqual(ficha[campo], original[campo])) throw new Error(`A ficha contém ${campo} incompatível com as regras. Recrie o personagem pelo terminal.`);
    }
    return { ...original, id: ficha.id, criado_em: ficha.criado_em, mundo_hash: ficha.mundo_hash, mundo_arquivo: ficha.mundo_arquivo };
}

module.exports = { ATRIBUTOS, calcularAtributos, criarPersonagem, validarPersonagem };
