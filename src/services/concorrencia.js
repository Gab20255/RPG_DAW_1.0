function criarFilaConcorrente(limite = 6) {
    if (!Number.isInteger(limite) || limite < 1 || limite > 12) throw new Error('GENERATION_CONCURRENCY deve estar entre 1 e 12.');
    let ativos = 0;
    const pendentes = [];
    const iniciar = () => {
        while (ativos < limite && pendentes.length) {
            const { tarefa, resolver, rejeitar } = pendentes.shift();
            ativos++;
            Promise.resolve().then(tarefa).then(resolver, rejeitar).finally(() => { ativos--; iniciar(); });
        }
    };
    return tarefa => new Promise((resolver, rejeitar) => { pendentes.push({ tarefa, resolver, rejeitar }); iniciar(); });
}

module.exports = { criarFilaConcorrente };
