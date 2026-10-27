const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const RAIZ = path.resolve(__dirname, '../..');

async function lerJson(arquivo) {
    if ((await fs.stat(arquivo)).size > 1024 * 1024) throw new Error('O JSON deve ter até 1 MB.');
    return JSON.parse(await fs.readFile(arquivo, 'utf8'));
}

function hashMundo(mundo) { return createHash('sha256').update(JSON.stringify(mundo)).digest('hex'); }

async function listarJson(pasta, validar) {
    let nomes;
    try { nomes = await fs.readdir(pasta); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const arquivos = [];
    for (const nome of nomes.filter((item) => item.endsWith('.json')).sort().reverse()) {
        const arquivo = path.join(pasta, nome);
        try { const dados = await lerJson(arquivo); validar(dados); arquivos.push({ arquivo, dados }); } catch { /* Ignora arquivos incompletos na selecao. */ }
    }
    return arquivos;
}

async function salvarNovo(pasta, prefixo, dados) {
    await fs.mkdir(pasta, { recursive: true });
    const data = new Date().toISOString().replace(/[:.]/g, '-');
    const arquivo = path.join(pasta, `${prefixo}-${data}-${randomUUID().slice(0, 8)}.json`);
    await fs.writeFile(arquivo, `${JSON.stringify(dados, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return arquivo;
}

async function salvarAtomico(arquivo, dados) {
    await fs.mkdir(path.dirname(arquivo), { recursive: true });
    const temporario = `${arquivo}.${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporario, `${JSON.stringify(dados, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temporario, arquivo);
    } catch (error) { await fs.unlink(temporario).catch(() => {}); throw error; }
}

module.exports = { RAIZ, lerJson, hashMundo, listarJson, salvarNovo, salvarAtomico };
