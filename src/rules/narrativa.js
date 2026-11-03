const { createHash: criarHash } = require('node:crypto');

const LIMITE_CONTEXTO = 14000;

function conferirCampos(valor, campos, rotulo) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor) || Object.keys(valor).length !== campos.length || campos.some(campo => !Object.hasOwn(valor, campo))) throw new Error(`${rotulo}: campos inválidos.`);
}

function conferirTexto(valor, limite, rotulo, vazio = false) {
    if (typeof valor !== 'string' || (!vazio && !valor.trim()) || valor.length > limite) throw new Error(`${rotulo}: texto inválido.`);
}

function conferirLista(valor, maximo, validar, rotulo) {
    if (!Array.isArray(valor) || valor.length > maximo) throw new Error(`${rotulo}: lista inválida.`);
    valor.forEach(validar);
}

function chaveTexto(texto) {
    return texto.normalize('NFKC').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function identificadorTexto(tipo, texto) {
    return `${tipo}_${criarHash('sha256').update(chaveTexto(texto)).digest('hex').slice(0, 16)}`;
}

function validarDirecao(direcao) {
    conferirCampos(direcao, ['conflito', 'objetivo', 'gancho', 'desfechos_possiveis'], 'Direção');
    for (const campo of ['conflito', 'objetivo', 'gancho']) conferirTexto(direcao[campo], 400, campo);
    conferirLista(direcao.desfechos_possiveis, 3, texto => conferirTexto(texto, 240, 'Desfecho possível'), 'Desfechos');
    if (!direcao.desfechos_possiveis.length) throw new Error('Desfechos possíveis ausentes.');
    return direcao;
}

const MODELO_DIRECAO = { conflito: '', objetivo: '', gancho: '', desfechos_possiveis: [''] };
const MODELO_CENA = {
    pedido_id: '', turno: 1, ambiente_id: '', narracao: '', resumo: '',
    direcao: [MODELO_DIRECAO], fatos: [''], pistas: [''], acontecimentos: [''],
    objetivos: [{ id: '', estado: '', motivo: '' }],
    novidades: {
        locais: [{ nome: '', descricao: '' }],
        npcs: [{ nome: '', descricao: '', motivacao: '' }],
        criaturas: [{ nome: '', descricao: '', comportamento: '' }],
        itens: [{ nome: '', descricao: '' }],
        missoes: [{ titulo: '', objetivo: '' }],
    },
    exige_resolucao_mecanica: false,
    encerramento: { concluir: false, desfecho: '' },
};

function criarEsquema(valor) {
    if (Array.isArray(valor)) return { type: 'array', items: criarEsquema(valor[0]) };
    if (valor && typeof valor === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, criarEsquema(item)])), required: Object.keys(valor), additionalProperties: false };
    return { type: typeof valor === 'number' ? 'integer' : typeof valor };
}

module.exports = { LIMITE_CONTEXTO, MODELO_CENA, MODELO_DIRECAO, conferirCampos, conferirTexto, conferirLista, chaveTexto, identificadorTexto, validarDirecao, criarEsquema };
