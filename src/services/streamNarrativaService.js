function lerNarracaoParcial(texto) {
    const inicio = texto.match(/"narracao"\s*:\s*"/);
    if (!inicio) return '';
    const trecho = texto.slice(inicio.index + inicio[0].length);
    let fim = 0;
    while (fim < trecho.length) {
        if (trecho[fim] === '"') break;
        if (trecho[fim] === '\\') {
            const tamanho = trecho[fim + 1] === 'u' ? 6 : 2;
            if (fim + tamanho > trecho.length) break;
            fim += tamanho;
        } else fim++;
    }
    try { return JSON.parse('"' + trecho.slice(0, fim) + '"'); }
    catch { return ''; }
}

async function lerStreamOpenRouter(body, aoTexto) {
    const decoder = new TextDecoder();
    let buffer = '', texto = '', motivo = null, terminou = false;
    function evento(bloco) {
        const dados = bloco.split('\n').filter(linha => linha.startsWith('data:')).map(linha => linha.slice(5).trimStart()).join('\n');
        if (!dados) return;
        if (dados === '[DONE]') { terminou = true; return; }
        const resposta = JSON.parse(dados);
        if (resposta.error) throw new Error('O provedor interrompeu a narração.');
        const escolha = resposta.choices?.[0];
        const parte = escolha?.delta?.content;
        if (typeof parte === 'string') {
            texto += parte;
            if (texto.length > 128000) throw new Error('Resposta narrativa excedeu o limite.');
            aoTexto(texto);
        }
        motivo = escolha?.finish_reason || motivo;
    }
    for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });
        let separador;
        while ((separador = /\r?\n\r?\n/.exec(buffer))) {
            evento(buffer.slice(0, separador.index).replace(/\r\n/g, '\n'));
            buffer = buffer.slice(separador.index + separador[0].length);
        }
        if (buffer.length > 128000) throw new Error('Evento narrativo excedeu o limite.');
    }
    buffer += decoder.decode();
    if (buffer.trim()) evento(buffer.replace(/\r\n/g, '\n'));
    if (!terminou || !motivo) throw new Error('Narração interrompida antes da conclusão.');
    return { choices: [{ message: { content: texto }, finish_reason: motivo }] };
}

module.exports = { lerNarracaoParcial, lerStreamOpenRouter };
