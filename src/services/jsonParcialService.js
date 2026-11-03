function extrairPrefixoJson(conteudo) {
    if (typeof conteudo !== 'string' || conteudo.length > 2 * 1024 * 1024) return null;
    const texto = conteudo.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let indice = 0;
    const espacos = () => { while (/\s/.test(texto[indice] || '') && indice < texto.length) indice++; };
    function lerTexto() {
        const inicio = indice++;
        let escape = false;
        while (indice < texto.length) {
            const caractere = texto[indice++];
            if (escape) escape = false;
            else if (caractere === '\\') escape = true;
            else if (caractere === '"') return { completo: true, valor: JSON.parse(texto.slice(inicio, indice)) };
        }
        return { completo: false };
    }
    function lerValor(profundidade = 0) {
        if (profundidade > 64) throw new Error('JSON excede a profundidade permitida.');
        espacos();
        const caractere = texto[indice];
        if (!caractere) return { completo: false };
        if (caractere === '"') return lerTexto();
        if (caractere === '{' || caractere === '[') {
            const objeto = caractere === '{';
            const valor = objeto ? Object.create(null) : [];
            const filhos = objeto ? Object.create(null) : [];
            const fechamento = objeto ? '}' : ']';
            indice++;
            while (true) {
                espacos();
                if (indice >= texto.length) return { completo: false, valor, filhos };
                if (texto[indice] === fechamento) { indice++; return { completo: true, valor, filhos }; }
                let chave = filhos.length;
                if (objeto) {
                    if (texto[indice] !== '"') throw new Error('Chave JSON inválida.');
                    const nome = lerTexto();
                    if (!nome.completo) return { completo: false, valor, filhos };
                    chave = nome.valor;
                    if (Object.hasOwn(filhos, chave)) throw new Error('Chave JSON repetida.');
                    espacos();
                    if (indice >= texto.length) return { completo: false, valor, filhos };
                    if (texto[indice++] !== ':') throw new Error('Separador JSON inválido.');
                }
                const item = lerValor(profundidade + 1);
                filhos[chave] = item;
                if (item.valor !== undefined) valor[chave] = item.valor;
                if (!item.completo) return { completo: false, valor, filhos };
                espacos();
                if (indice >= texto.length) return { completo: false, valor, filhos };
                if (texto[indice] === fechamento) { indice++; return { completo: true, valor, filhos }; }
                if (texto[indice++] !== ',') throw new Error('Separador JSON inválido.');
                espacos();
                if (texto[indice] === fechamento) throw new Error('Vírgula JSON inválida.');
            }
        }
        const restante = texto.slice(indice);
        const literal = restante.match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|[,}\]]|$)/);
        if (literal) { indice += literal[0].length; return { completo: true, valor: JSON.parse(literal[0]) }; }
        if (/^(?:t(?:r(?:u(?:e)?)?)?|f(?:a(?:l(?:s(?:e)?)?)?)?|n(?:u(?:l(?:l)?)?)?|-?\d*(?:\.\d*)?(?:[eE][+-]?\d*)?)$/.test(restante)) return { completo: false };
        throw new Error('Valor JSON inválido.');
    }
    try { return lerValor(); } catch { return null; }
}

module.exports = { extrairPrefixoJson };
