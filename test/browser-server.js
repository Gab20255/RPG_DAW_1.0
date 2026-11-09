// Exclusivo para testes: banco em memória e narrador determinístico, sem chaves externas.
const { ambienteTeste } = require('./helpers');
ambienteTeste(3189).then(env => {
    console.log(`Servidor de teste: ${env.url}`);
    process.once('SIGTERM', async () => { await env.fechar(); process.exit(0); });
    process.once('SIGINT', async () => { await env.fechar(); process.exit(0); });
}).catch(error => { console.error(error); process.exitCode = 1; });
