const arquivos = require('node:fs');
const caminhos = require('node:path');
const { parse: interpretarEnv } = require('dotenv');
const { RAIZ } = require('./terminal/arquivos');
const { criarAplicacao } = require('./http/aplicacao');

function obterPorta() {
    let configuracao = {};
    try { configuracao = interpretarEnv(arquivos.readFileSync(caminhos.join(RAIZ, '.env'))); }
    catch (erro) { if (erro.code !== 'ENOENT') throw erro; }
    return Number(configuracao.PORT || process.env.PORT || 3000);
}

async function iniciarServidor({ porta = obterPorta(), aplicacao = criarAplicacao() } = {}) {
    if (!Number.isInteger(porta) || porta < 0 || porta > 65535) throw new Error('PORT deve ser um inteiro de 0 a 65535.');
    return new Promise((resolver, rejeitar) => {
        const servidor = aplicacao.listen(porta, '127.0.0.1', () => resolver(servidor));
        servidor.once('error', rejeitar);
    });
}

async function executarServidor() {
    const servidor = await iniciarServidor();
    console.log(`API: http://127.0.0.1:${servidor.address().port}`);
    const encerrar = () => { servidor.close(); servidor.closeIdleConnections(); };
    process.once('SIGINT', encerrar);
    process.once('SIGTERM', encerrar);
    return servidor;
}

if (require.main === module) executarServidor().catch(erro => { console.error(erro.message); process.exitCode = 1; });

module.exports = { iniciarServidor, executarServidor, obterPorta };
