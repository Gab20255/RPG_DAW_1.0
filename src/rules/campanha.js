const QUANTIDADES_CAMPANHA = { classes: 8, racas: 6, faccoes: 6, personagens: 24, ambientes: 18, itens: 24, criaturas: 20, missoes: 16 };
const TOTAL_CAPITULOS = 6;
const TOTAL_GANCHOS = 8;
const MODELO_CAPITULO = {
    id: 'capitulo_1', titulo: 'Título do capítulo', sinopse: 'Situação inicial e papel no arco da campanha',
    desenvolvimento: 'Desenvolvimento detalhado, causas, tensões, descobertas e caminhos alternativos',
    cenas: [{
        nome: 'Nome da cena', descricao: 'Preparação e descrição sensorial da situação', objetivo: 'Problema aberto para o grupo',
        ambientes_ids: ['ambiente_1'], personagens_ids: ['npc_1'], criaturas_ids: ['criatura_1'], missoes_ids: ['missao_1'],
        pistas: ['Pista concreta e como pode ser encontrada'], abordagens: ['Uma forma possível de lidar com a situação'],
        consequencias: ['Consequência condicional, sem decidir as ações dos jogadores'],
    }],
    desfechos_possiveis: ['Resultado possível e seus efeitos nas etapas seguintes'],
};

module.exports = { QUANTIDADES_CAMPANHA, TOTAL_CAPITULOS, TOTAL_GANCHOS, MODELO_CAPITULO };
