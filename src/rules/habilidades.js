// Regras de prototipo. Documento de referencia: Sistema Balanceado de Habilidades.
// Distancias em metros; recarga/duracao em turnos. Nada aqui depende da IA.
const VERSAO_REGRAS = '0.1.0';
const CATEGORIAS = ['ofensiva', 'defensiva', 'mobilidade', 'controle', 'suporte', 'utilitaria', 'suprema'];
const CONDICOES = ['linha_de_visao', 'preparacao', 'imovel', 'vida_baixa'];
const EFEITOS = { empurrao: 5, lentidao: 10, marcacao: 5 };
const REGRAS = {
    versao: VERSAO_REGRAS, nivelInicial: 1, energiaInicial: 100, vidaInicial: 100,
    habilidadesIniciais: 2, atributoBase: 10, bonusMaximo: 4, somaBonusPositivosMaxima: 6,
    unidades: { alcance: 'metros', recarga: 'turnos', duracao: 'turnos' },
};

function inteiro(valor, min, max, campo) {
    if (!Number.isInteger(valor) || valor < min || valor > max) throw new Error(`${campo} deve estar entre ${min} e ${max}.`);
}

function calcularOrcamento(habilidade) {
    const principal = ['ofensiva', 'defensiva', 'suporte', 'suprema'].includes(habilidade.categoria)
        ? habilidade.potencia : ({ mobilidade: 15, controle: 15, utilitaria: 8 }[habilidade.categoria]);
    const alcance = habilidade.alcance > 8 ? 10 : habilidade.alcance > 3 ? 5 : 0;
    const area = habilidade.raioArea ? 10 + 5 * (habilidade.raioArea - 1) : 0;
    const duracao = habilidade.duracao * 5;
    const secundarios = habilidade.efeitos.reduce((soma, efeito) => soma + EFEITOS[efeito], 0);
    const descontos = Math.min(0.25, habilidade.condicoes.reduce((soma, condicao) => soma + ({ preparacao: 0.1, imovel: 0.1, vida_baixa: 0.15 }[condicao] || 0), 0));
    const subtotal = principal + alcance + area + duracao + secundarios;
    return { principal, alcance, area, duracao, secundarios, descontoPercentual: descontos * 100, total: Math.ceil(subtotal * (1 - descontos)) };
}

function orcamentoPorNivel(nivel, categoria) {
    inteiro(nivel, 1, 20, 'Nivel');
    return ({ controle: 35, mobilidade: 35, utilitaria: 30 }[categoria] || 40) + 5 * (nivel - 1);
}

function validarTemplate(habilidade) {
    if (!CATEGORIAS.includes(habilidade.categoria)) throw new Error('Categoria de habilidade invalida.');
    inteiro(habilidade.nivelMinimo, 1, 20, 'Nivel minimo');
    inteiro(habilidade.potencia, 0, 80, 'Potencia');
    inteiro(habilidade.alcance, 0, 15, 'Alcance');
    inteiro(habilidade.raioArea, 0, 3, 'Raio de area');
    inteiro(habilidade.recarga, 1, 10, 'Recarga');
    inteiro(habilidade.duracao, 0, 3, 'Duracao');
    for (const [lista, permitidos, campo] of [[habilidade.efeitos, Object.keys(EFEITOS), 'Efeitos'], [habilidade.condicoes, CONDICOES, 'Condicoes']]) {
        if (!Array.isArray(lista) || new Set(lista).size !== lista.length || lista.some((valor) => !permitidos.includes(valor))) throw new Error(`${campo} invalidos.`);
    }
    if (!Array.isArray(habilidade.contrajogo) || !habilidade.contrajogo.length) throw new Error('A habilidade precisa permitir contrajogo.');
    if (habilidade.categoria === 'controle' && habilidade.duracao > 1) throw new Error('Controle deve durar no maximo um turno.');
    if (habilidade.categoria === 'suprema' && (habilidade.nivelMinimo < 6 || habilidade.recarga < 6 || !habilidade.condicoes.includes('preparacao'))) throw new Error('Suprema exige nivel 6, preparacao e recarga minima de 6 turnos.');
    const pp = calcularOrcamento(habilidade);
    if (pp.total > orcamentoPorNivel(habilidade.nivelMinimo, habilidade.categoria)) throw new Error('Habilidade excede o orcamento de poder do nivel e categoria.');
    const recargaMinima = pp.total <= 20 ? 1 : pp.total <= 40 ? 3 : 4;
    if (habilidade.recarga < recargaMinima) throw new Error('Recarga insuficiente para o impacto da habilidade.');
    const custo = Math.round(8 + 0.35 * pp.total);
    if (custo > 40 + 2 * habilidade.nivelMinimo) throw new Error('Custo acima do limite do nivel.');
    return { ...structuredClone(habilidade), orcamento: pp, custoRecurso: custo, versaoRegras: VERSAO_REGRAS, validada: true };
}

const base = { nivelMinimo: 1, potencia: 0, alcance: 0, raioArea: 0, recarga: 3, duracao: 0, efeitos: [], condicoes: [], contrajogo: ['Pode ser interrompida.'] };
const DEFINICOES = [
    { id: 'golpe_preciso', nome: 'Golpe preciso', categoria: 'ofensiva', potencia: 25, alcance: 2, descricao: 'Um ataque concentrado contra um inimigo próximo.', alvo: 'Um inimigo', contrajogo: ['Esquiva', 'Bloqueio'], limitacao: 'Exige um alvo ao alcance.' },
    { id: 'projetil', nome: 'Projétil de energia', categoria: 'ofensiva', potencia: 30, alcance: 8, recarga: 4, condicoes: ['linha_de_visao'], descricao: 'Concentra energia em um disparo contra um único alvo.', alvo: 'Um inimigo', contrajogo: ['Esquiva', 'Bloqueio', 'Cobertura'], limitacao: 'Não atravessa obstáculos.' },
    { id: 'onda', nome: 'Onda de impacto', categoria: 'ofensiva', potencia: 20, alcance: 3, raioArea: 1, recarga: 4, descricao: 'Um impacto curto atinge uma pequena área.', alvo: 'Inimigos na área', contrajogo: ['Sair da área', 'Bloqueio'], limitacao: 'Raio de apenas um metro.' },
    { id: 'barreira', nome: 'Barreira concentrada', categoria: 'defensiva', potencia: 20, duracao: 1, descricao: 'Absorve até 20 pontos do próximo dano recebido.', alvo: 'Você', contrajogo: ['Pressão contínua', 'Aguardar a barreira expirar'], limitacao: 'Expira após um ataque ou um turno.' },
    { id: 'guarda', nome: 'Guarda compartilhada', categoria: 'defensiva', potencia: 15, alcance: 3, duracao: 1, descricao: 'Protege um aliado próximo do próximo impacto.', alvo: 'Um aliado', contrajogo: ['Mudar o alvo', 'Aguardar a proteção expirar'], limitacao: 'Protege contra um ataque, sem acumular barreiras.' },
    { id: 'passo', nome: 'Passo relâmpago', categoria: 'mobilidade', alcance: 3, recarga: 2, descricao: 'Reposiciona-se até três metros em um espaço livre.', alvo: 'Você', contrajogo: ['Bloquear a rota', 'Antecipar a chegada'], limitacao: 'Não atravessa barreiras sólidas.' },
    { id: 'selo', nome: 'Selo de lentidão', categoria: 'controle', alcance: 6, duracao: 1, recarga: 4, condicoes: ['linha_de_visao'], descricao: 'Reduz o deslocamento de um inimigo por um turno.', alvo: 'Um inimigo', contrajogo: ['Resistência', 'Esquiva'], limitacao: 'Não acumula e não impede todas as ações.' },
    { id: 'pulso', nome: 'Pulso restaurador', categoria: 'suporte', potencia: 20, alcance: 3, recarga: 4, descricao: 'Recupera até 20 pontos de vida de um aliado.', alvo: 'Você ou um aliado', contrajogo: ['Interromper a concentração'], limitacao: 'Não excede a vida máxima e não ressuscita.' },
    { id: 'vinculo', nome: 'Vínculo de recuperação', categoria: 'suporte', potencia: 12, alcance: 3, raioArea: 1, recarga: 4, condicoes: ['imovel'], descricao: 'Recupera um pouco de vida dos aliados próximos.', alvo: 'Aliados na área', contrajogo: ['Interrupção', 'Separar o grupo'], limitacao: 'Exige permanecer imóvel durante a ativação.' },
    { id: 'percepcao', nome: 'Percepção aguçada', categoria: 'utilitaria', alcance: 8, duracao: 1, recarga: 2, descricao: 'Ajuda a perceber indícios visíveis em uma área.', alvo: 'Um ambiente próximo', contrajogo: ['Ocultação', 'Pistas falsas'], limitacao: 'Não revela segredos automaticamente nem substitui testes.' },
    { id: 'sinal', nome: 'Sinal do explorador', categoria: 'utilitaria', alcance: 8, duracao: 2, recarga: 3, descricao: 'Deixa uma marca perceptível para orientar o grupo.', alvo: 'Um ponto visível', contrajogo: ['Apagar a marca', 'Ocultar o local'], limitacao: 'Não revela novas áreas ou passagens.' },
    { id: 'ruptura', nome: 'Ruptura suprema', categoria: 'suprema', nivelMinimo: 6, potencia: 45, alcance: 8, raioArea: 2, recarga: 8, condicoes: ['preparacao', 'linha_de_visao'], descricao: 'Prepara uma descarga de grande impacto em área.', alvo: 'Inimigos na área', contrajogo: ['Interromper a preparação', 'Sair da área'], limitacao: 'Requer um turno de preparação visível.' },
];
const CATALOGO = DEFINICOES.map((definicao) => validarTemplate({ ...base, ...definicao }));

function listarHabilidades(nivel = 1) {
    inteiro(nivel, 1, 20, 'Nivel');
    return CATALOGO.map((habilidade) => ({ ...structuredClone(habilidade), disponivel: nivel >= habilidade.nivelMinimo,
        motivoBloqueio: nivel < habilidade.nivelMinimo ? `Disponível a partir do nível ${habilidade.nivelMinimo}.` : null }));
}

function selecionarHabilidades(ids, nivel = 1, maximo = 2) {
    if (!Array.isArray(ids) || ids.length !== maximo || new Set(ids).size !== ids.length) throw new Error(`Escolha exatamente ${maximo} habilidades diferentes.`);
    return ids.map((id) => {
        const habilidade = listarHabilidades(nivel).find((item) => item.id === id);
        if (!habilidade) throw new Error('Habilidade desconhecida.');
        if (!habilidade.disponivel) throw new Error(habilidade.motivoBloqueio);
        return habilidade;
    });
}

function aplicarApresentacao(id, apresentacao) {
    const original = CATALOGO.find((item) => item.id === id);
    if (!original) throw new Error('Habilidade desconhecida.');
    if (!apresentacao || Object.keys(apresentacao).some((chave) => !['nome', 'descricao', 'visual'].includes(chave))) throw new Error('A apresentação não pode alterar campos mecânicos.');
    for (const texto of Object.values(apresentacao)) if (typeof texto !== 'string' || !texto.trim() || texto.length > 500) throw new Error('Apresentação inválida.');
    return { ...structuredClone(original), apresentacao: { ...apresentacao } };
}

module.exports = { REGRAS, CATEGORIAS, calcularOrcamento, orcamentoPorNivel, validarTemplate, listarHabilidades, selecionarHabilidades, aplicarApresentacao };
