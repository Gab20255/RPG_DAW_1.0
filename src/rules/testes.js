const { randomInt: sortearInteiro } = require('node:crypto');
const { isDeepStrictEqual: saoIguais } = require('node:util');
const { ATRIBUTOS } = require('../services/personagemService');

const DIFICULDADE_TESTE = 12;

function interpretarTeste(entrada) {
    const partes = entrada.match(/^\/teste\s+(\S+)\s+([\s\S]+)$/);
    if (!partes || !ATRIBUTOS.includes(partes[1]) || !partes[2].trim()) throw new Error('Teste inválido.');
    return { atributo: partes[1], descricao: partes[2].trim() };
}

function resolverTeste(atributos, atributo, descricao, rolar = () => sortearInteiro(1, 21)) {
    if (!ATRIBUTOS.includes(atributo) || !Number.isInteger(atributos?.[atributo]) || atributos[atributo] < 1 || atributos[atributo] > 30) throw new Error('Atributo inválido.');
    if (typeof descricao !== 'string' || !descricao.trim() || descricao.length > 1000) throw new Error('Descrição do teste inválida.');
    const dado = rolar();
    if (!Number.isInteger(dado) || dado < 1 || dado > 20) throw new Error('Rolagem inválida.');
    const bonus = Math.floor((atributos[atributo] - 10) / 2);
    return { atributo, descricao: descricao.trim(), d20: dado, bonus, total: dado + bonus, dificuldade: DIFICULDADE_TESTE, sucesso: dado + bonus >= DIFICULDADE_TESTE };
}

function validarTeste(teste, atributos, entrada) {
    const { atributo, descricao } = interpretarTeste(entrada);
    const esperado = resolverTeste(atributos, atributo, descricao, () => teste?.d20);
    if (!saoIguais(teste, esperado)) throw new Error('Resultado do teste incompatível com a ficha e a ação.');
    return teste;
}

function descreverTeste(teste) {
    return `Teste de ${teste.atributo}: ${teste.sucesso ? 'SUCESSO' : 'FALHA'} (D20 ${teste.d20} + bônus ${teste.bonus} = ${teste.total}; dificuldade ${teste.dificuldade}).`;
}

module.exports = { DIFICULDADE_TESTE, interpretarTeste, resolverTeste, validarTeste, descreverTeste };
