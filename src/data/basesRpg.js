const { listarHabilidades, REGRAS } = require('../rules/habilidades');

function classe(nome, descricao, bonus, habilidades, item) {
    const catalogo = listarHabilidades();
    return {
        nome, descricao,
        bonus_atributos: { forca: 0, destreza: 0, inteligencia: 0, carisma: 0, constituicao: 0, sabedoria: 0, ...bonus },
        habilidades: habilidades.map(id => {
            const habilidade = catalogo.find(opcao => opcao.id === id);
            return { nome: habilidade.nome, descricao: habilidade.descricao, limitacao: habilidade.limitacao };
        }),
        itens_iniciais_ids: [`item_${item}`, 'item_5'],
    };
}

function prepararBase(definicao) {
    const ambientes = definicao.locais.map(([nome, tipo, descricao, perigo], indice) => ({
        id: `ambiente_${indice + 1}`, nome, tipo, descricao,
        importancia: ['Ponto de encontro e apoio para os primeiros contatos.', 'Fonte de informações e recursos para investigar a premissa.', 'Área de exploração; os riscos dependem das decisões do grupo.'][indice],
        perigos: [perigo], conexoes_ids: indice === 0 ? ['ambiente_2', 'ambiente_3'] : ['ambiente_1'],
        personagens_ids: indice < 2 ? [`npc_${indice + 1}`] : [], prompt_imagem: `${nome}. ${descricao}`,
    }));
    const faccoes = definicao.grupos.map(([nome, descricao, objetivo], indice) => ({
        id: `faccao_${indice + 1}`, nome, descricao, objetivo, aliados_ids: [], rivais_ids: [],
    }));
    const personagens = definicao.contatos.map(([nome, descricao, motivacao], indice) => ({
        id: `npc_${indice + 1}`, nome, papel: 'neutro', descricao,
        aparencia: indice === 0 ? 'Roupas gastas de trabalho, postura atenta e uma bolsa de anotações.' : 'Mãos marcadas pelo ofício, roupa prática e olhar desconfiado.',
        personalidade: indice === 0 ? 'Pragmática, faz perguntas antes de oferecer ajuda.' : 'Cauteloso, prefere provas a promessas.',
        motivacao, segredo: 'Ainda não há segredo pessoal estabelecido nesta campanha.',
        faccoes_ids: [`faccao_${indice + 1}`], ambiente_id: `ambiente_${indice + 1}`,
        prompt_imagem: `${nome}, ${descricao}`,
    }));
    return {
        id: definicao.id, nome: definicao.nome, descricao: definicao.descricao, palavras_chave: definicao.palavras_chave, versao: '1.0',
        mundo: {
            versao: '1.0',
            mundo: {
                nome: definicao.nome, tema: definicao.descricao, tom: definicao.tom, descricao: definicao.descricao,
                regras_do_universo: [
                    ...definicao.regras,
                    'A premissa informada define os fatos da campanha; esta base oferece elementos iniciais, sem impor uma cronologia ou um desfecho.',
                    'Descrições de classes e equipamentos não concedem efeitos além das regras de habilidades validadas pelo código.',
                ],
                ambiente_inicial_id: 'ambiente_1',
            },
            historia: {
                passado: 'O passado da campanha será o informado na história inicial.',
                situacao_atual: `Em ${ambientes[0].nome}, os primeiros contatos estão disponíveis. O conflito da premissa ainda não foi resolvido.`,
                conflito_principal: 'O conflito é o apresentado na história inicial; as motivações e respostas serão exploradas durante a partida.',
                objetivo_principal: 'Investigar a situação da premissa e decidir como agir. O grupo pode buscar aliados, negociar, explorar ou propor outro caminho.',
                preludio: `${ambientes[0].descricao} ${personagens[0].nome} organiza anotações e observa quem chega. Nenhuma tarefa foi aceita e nenhuma decisão do personagem foi tomada.`,
                segredos: [], eventos_historicos: [],
            },
            classes: definicao.classes.map((opcao, indice) => ({ id: `classe_${indice + 1}`, ...opcao })),
            racas: [], faccoes, personagens, ambientes,
            itens: [...definicao.equipamentos, ['Suprimentos pessoais', 'suprimentos', 'Água, alimento e material básico de viagem.', 'Sustento cotidiano; não recupera recursos automaticamente.']]
                .map(([nome, tipo, descricao, efeito], indice) => ({ id: `item_${indice + 1}`, nome, tipo, descricao, efeito, raridade: 'comum' })),
            criaturas: [{
                id: 'criatura_1', nome: definicao.ameaca[0], descricao: definicao.ameaca[1], comportamento: definicao.ameaca[2],
                ameaca: 'baixa', ambientes_ids: ['ambiente_3'],
            }],
            missoes: [{
                id: 'missao_1', titulo: 'Primeiras pistas', tipo: 'principal',
                descricao: 'Reunir informações sobre o problema apresentado na premissa, sem assumir previamente quem tem razão.',
                objetivo: 'Encontrar uma pista verificável e decidir o próximo passo com o grupo.',
                ambientes_ids: ['ambiente_1', 'ambiente_2'], personagens_ids: ['npc_1', 'npc_2'],
                recompensas: ['Informações e contatos; recursos materiais dependem de validação pelas regras.'],
            }],
            ganchos_aventura: [
                'Os contatos locais oferecem versões diferentes de um acontecimento da premissa.',
                'Uma rota de investigação pode revelar quem ganha e quem perde com a situação atual.',
            ],
            regras_base: structuredClone(REGRAS),
        },
    };
}

const BASES_RPG = [
    {
        id: 'fantasia_medieval', nome: 'Fantasia medieval',
        descricao: 'Aventuras em reinos, comunidades e rotas de exploração, com magia, ofícios e disputas de poder. Também acomoda fantasia marítima.',
        palavras_chave: ['medieval', 'fantasia', 'reino', 'reinos', 'cavaleiro', 'dragao', 'elfo', 'mago', 'magia', 'imperio', 'maritima', 'pirata', 'navio', 'coroacao', 'trono'],
        tom: 'Aventura, exploração e intriga.',
        regras: ['Tecnologia e magia seguem os limites definidos na premissa.', 'Reputação, acordos e rotas de abastecimento influenciam as relações locais.'],
        classes: [
            classe('Guerreiro', 'Combatente de linha de frente, treinado em armas e proteção.', { forca: 3, constituicao: 2, destreza: 1 }, ['golpe_preciso', 'guarda'], 1),
            classe('Mago', 'Estudioso da magia, atento a símbolos, conhecimento e preparação.', { inteligencia: 3, sabedoria: 2, constituicao: 1 }, ['projetil', 'barreira'], 2),
            classe('Ladino', 'Especialista em furtividade, ferramentas e aproximações discretas.', { destreza: 3, inteligencia: 2, carisma: 1 }, ['passo', 'percepcao'], 3),
            classe('Clérigo', 'Cuidador e conselheiro ligado a uma tradição espiritual.', { sabedoria: 3, carisma: 2, constituicao: 1 }, ['pulso', 'guarda'], 4),
        ],
        locais: [
            ['Entreposto', 'povoado', 'Bancas, cordas e caixas ocupam um pátio de passagem. Viajantes trocam notícias junto a um balcão de provisões.', 'Conflitos comerciais e informações imprecisas.'],
            ['Arquivo dos viajantes', 'arquivo', 'Mapas, registros de viagem e livros de contas cobrem mesas de madeira. Há lacunas e correções nas anotações.', 'Documentos incompletos e acesso negociado.'],
            ['Passagem antiga', 'ruína', 'Marcas de uso recente cruzam uma passagem de pedra desgastada. Trechos estreitos limitam a visão.', 'Piso instável e passagem vigiada.'],
        ],
        grupos: [['Comunidade do entreposto', 'Moradores e trabalhadores da rota local.', 'Manter o abastecimento e a segurança.'], ['Liga dos viajantes', 'Guias e comerciantes que compartilham registros.', 'Preservar rotas e negociar informação.']],
        contatos: [['Lia', 'Responsável pelo balcão de provisões e pelos recados locais.', 'Evitar que as disputas prejudiquem os moradores.'], ['Raul', 'Copista que reúne relatos e mapas de viajantes.', 'Verificar as informações antes de divulgá-las.']],
        equipamentos: [['Espada de treino', 'arma', 'Lâmina simples de uso cotidiano.', 'Instrumento de combate, sem dano adicional automático.'], ['Foco arcano', 'foco', 'Peça gravada usada para concentrar a atenção.', 'Apoio narrativo às habilidades escolhidas.'], ['Ferramentas de precisão', 'ferramenta', 'Estojo de instrumentos pequenos.', 'Permite tentar trabalhos delicados; não garante sucesso.'], ['Estojo de curativos', 'ferramenta', 'Faixas e material de cuidado básico.', 'Apoio ao cuidado; não concede cura automática.']],
        ameaca: ['Vigia armado', 'Uma pessoa equipada para guardar uma passagem.', 'Questiona estranhos e pode negociar antes de recorrer à força.'],
    },
    {
        id: 'fantasia_sombria', nome: 'Fantasia sombria',
        descricao: 'Comunidades ameaçadas por fenômenos sobrenaturais, ruínas e mistérios, com recursos limitados e escolhas morais difíceis.',
        palavras_chave: ['fantasia sombria', 'maldicao', 'maldicoes', 'necromancia', 'ocultismo', 'sobrenatural', 'fornalhas', 'nevoa', 'trevas', 'ritual', 'mortos vivos', 'sol desapareceu'],
        tom: 'Mistério, tensão e esperança em condições difíceis.',
        regras: ['O sobrenatural tem custos e limites; descrições não autorizam poderes ilimitados.', 'Rumores podem estar errados; pistas precisam ser confrontadas.'],
        classes: [
            classe('Guerreiro', 'Defensor acostumado a proteger pessoas em situações perigosas.', { forca: 3, constituicao: 2, destreza: 1 }, ['golpe_preciso', 'guarda'], 1),
            classe('Caçador', 'Rastreador que observa sinais e evita confrontos desnecessários.', { destreza: 3, sabedoria: 2, constituicao: 1 }, ['percepcao', 'sinal'], 2),
            classe('Ocultista', 'Pesquisador de fenômenos e tradições sobrenaturais.', { inteligencia: 3, sabedoria: 2, constituicao: 1 }, ['projetil', 'selo'], 3),
            classe('Curandeiro', 'Especialista em cuidados e proteção dos companheiros.', { sabedoria: 3, inteligencia: 2, carisma: 1 }, ['pulso', 'guarda'], 4),
        ],
        locais: [
            ['Refúgio', 'abrigo', 'Luzes baixas iluminam mesas de reparo e mantas remendadas. As conversas diminuem quando alguém retorna da área externa.', 'Escassez e rumores que provocam desconfiança.'],
            ['Arquivo do santuário', 'arquivo', 'Cadernos de testemunhos dividem espaço com objetos de proteção e registros de desaparecimentos.', 'Relatos contraditórios e registros deteriorados.'],
            ['Passagem abandonada', 'ruína', 'Pedras úmidas e marcas antigas cercam um corredor estreito. Há sinais de presença recente.', 'Desabamentos e visibilidade reduzida.'],
        ],
        grupos: [['Cuidadores do refúgio', 'Pessoas que dividem provisões e tarefas de proteção.', 'Manter o abrigo funcionando.'], ['Guardadores dos registros', 'Estudiosos e testemunhas que preservam relatos.', 'Entender os perigos sem espalhar pânico.']],
        contatos: [['Lia', 'Organizadora dos turnos e dos suprimentos do refúgio.', 'Proteger os moradores sem esconder os riscos.'], ['Raul', 'Responsável por comparar depoimentos no arquivo.', 'Separar fenômenos observados de boatos.']],
        equipamentos: [['Lâmina curta', 'arma', 'Arma simples e bem conservada.', 'Instrumento de combate, sem dano adicional automático.'], ['Kit de rastreio', 'ferramenta', 'Corda, giz e instrumentos de observação.', 'Ajuda a registrar rastros sem revelá-los automaticamente.'], ['Caderno de símbolos', 'foco', 'Notas de estudo e desenhos comparativos.', 'Apoio narrativo; não concede conhecimento infalível.'], ['Bolsa de curativos', 'ferramenta', 'Faixas, recipientes e material limpo.', 'Apoio ao cuidado; não concede cura automática.']],
        ameaca: ['Animal acuado', 'Um animal territorial que se abriga entre as ruínas.', 'Evita grupos e reage quando cercado.'],
    },
    {
        id: 'ficcao_cientifica', nome: 'Ficção científica',
        descricao: 'Tecnologia avançada, redes, estações e conflitos entre pessoas e instituições. Acomoda exploração espacial, cyberpunk e inteligência artificial.',
        palavras_chave: ['ficcao cientifica', 'espacial', 'espaco', 'nave', 'naves', 'robo', 'robos', 'androide', 'cyberpunk', 'hacker', 'inteligencia artificial', 'tecnologico', 'tecnologica', 'asimov', 'cibernetico', 'orbital'],
        tom: 'Descoberta, tensão tecnológica e conflitos humanos.',
        regras: ['Sistemas têm permissões, fontes de energia e limitações físicas.', 'Tecnologia não concede acesso, informação ou efeitos mecânicos automaticamente.'],
        classes: [
            classe('Soldado', 'Combatente treinado para proteção e operações em equipe.', { forca: 3, constituicao: 2, destreza: 1 }, ['golpe_preciso', 'guarda'], 1),
            classe('Engenheiro', 'Especialista em manutenção, sistemas e investigação técnica.', { inteligencia: 3, destreza: 2, sabedoria: 1 }, ['percepcao', 'barreira'], 2),
            classe('Batedor', 'Explorador que observa rotas e se desloca com discrição.', { destreza: 3, sabedoria: 2, constituicao: 1 }, ['passo', 'sinal'], 3),
            classe('Médico', 'Profissional de atendimento e apoio à equipe.', { sabedoria: 3, inteligencia: 2, carisma: 1 }, ['pulso', 'guarda'], 4),
        ],
        locais: [
            ['Ponto de apoio', 'posto', 'Painéis de serviço iluminam uma área de espera com bancos e armários. Avisos de manutenção se alternam nas telas.', 'Vigilância e acesso restrito a recursos.'],
            ['Terminal público', 'arquivo digital', 'Estações de consulta mostram registros públicos e solicitações de acesso. O ruído da ventilação ocupa as pausas.', 'Dados incompletos e permissões limitadas.'],
            ['Setor técnico', 'instalação', 'Cabos, dutos e painéis de inspeção cercam um corredor de manutenção. Luzes indicam setores em operação.', 'Equipamentos energizados e portas controladas.'],
        ],
        grupos: [['Equipe de apoio', 'Técnicos e residentes que mantêm serviços essenciais.', 'Preservar o funcionamento dos serviços.'], ['Rede de operadores', 'Profissionais que negociam acesso e conhecimento técnico.', 'Proteger seus contatos e registros.']],
        contatos: [['Lia', 'Coordenadora do atendimento no ponto de apoio.', 'Resolver falhas sem expor os residentes.'], ['Raul', 'Operador que orienta consultas aos registros públicos.', 'Investigar inconsistências sem perder o acesso.']],
        equipamentos: [['Bastão de serviço', 'arma', 'Equipamento de defesa de curto alcance.', 'Instrumento de combate, sem dano adicional automático.'], ['Kit de manutenção', 'ferramenta', 'Leitor de diagnóstico e ferramentas manuais.', 'Permite tentar reparos; não ignora permissões.'], ['Comunicador portátil', 'ferramenta', 'Dispositivo de comunicação local.', 'Contato sujeito ao alcance e às condições da rede.'], ['Estojo médico', 'ferramenta', 'Material básico de atendimento.', 'Apoio ao cuidado; não concede cura automática.']],
        ameaca: ['Drone de vigilância', 'Unidade de inspeção com sensores e sinalizador.', 'Solicita identificação e alerta a segurança quando detecta intrusões.'],
    },
    {
        id: 'investigacao_contemporanea', nome: 'Investigação contemporânea',
        descricao: 'Mistérios em ambientes atuais, com testemunhas, registros, interesses políticos e investigação de evidências.',
        palavras_chave: ['investigacao', 'contemporanea', 'detetive', 'policial', 'crime', 'crimes', 'assassinato', 'desaparecimento', 'jornalista', 'delegacia', 'evidencias', 'corrupcao', 'urbano'],
        tom: 'Suspense, investigação e dilemas pessoais.',
        regras: ['O cenário usa tecnologia cotidiana; fenômenos extraordinários só existem quando estabelecidos na premissa.', 'Depoimentos não são provas conclusivas, e acesso a locais e documentos pode exigir negociação.'],
        classes: [
            classe('Investigador', 'Especialista em observação, entrevistas e cruzamento de pistas.', { inteligencia: 3, sabedoria: 2, carisma: 1 }, ['percepcao', 'sinal'], 1),
            classe('Policial', 'Profissional treinado em proteção, abordagem e resposta a riscos.', { constituicao: 3, forca: 2, destreza: 1 }, ['golpe_preciso', 'guarda'], 2),
            classe('Jornalista', 'Pesquisador de fontes, registros e interesses públicos.', { carisma: 3, inteligencia: 2, sabedoria: 1 }, ['percepcao', 'passo'], 3),
            classe('Médico', 'Profissional de saúde capaz de observar sinais e prestar atendimento.', { sabedoria: 3, inteligencia: 2, carisma: 1 }, ['pulso', 'guarda'], 4),
        ],
        locais: [
            ['Café da esquina', 'ponto de encontro', 'O balcão reúne moradores, recados e jornais. Uma mesa próxima à janela permite conversar sem interromper o atendimento.', 'Informações expostas a curiosos.'],
            ['Arquivo público', 'arquivo', 'Pastas catalogadas e terminais de consulta ocupam uma sala de atendimento. Alguns documentos dependem de autorização.', 'Registros incompletos e acesso limitado.'],
            ['Galpão desativado', 'galpão', 'Portões gastos cercam um pátio com caixas vazias e sinais de circulação recente.', 'Estruturas instáveis e propriedade vigiada.'],
        ],
        grupos: [['Associação de moradores', 'Pessoas que acompanham problemas da comunidade.', 'Proteger os moradores e obter respostas.'], ['Rede de fontes', 'Profissionais que compartilham informações verificáveis.', 'Preservar as fontes e a credibilidade.']],
        contatos: [['Lia', 'Atendente que acompanha notícias e recados do bairro.', 'Evitar que boatos prejudiquem os vizinhos.'], ['Raul', 'Funcionário que organiza consultas ao arquivo público.', 'Preservar documentos e esclarecer inconsistências.']],
        equipamentos: [['Caderno de investigação', 'ferramenta', 'Bloco de notas com divisórias para registros.', 'Organiza pistas conhecidas; não revela respostas.'], ['Lanterna', 'ferramenta', 'Lanterna portátil com bateria.', 'Ilumina áreas próximas enquanto houver energia.'], ['Gravador portátil', 'ferramenta', 'Dispositivo simples de registro de áudio.', 'Registra conversas conforme as condições da cena.'], ['Maleta de primeiros socorros', 'ferramenta', 'Material básico de atendimento.', 'Apoio ao cuidado; não concede cura automática.']],
        ameaca: ['Vigia particular', 'Uma pessoa contratada para guardar o galpão.', 'Questiona visitantes e pode aceitar conversar.'],
    },
    {
        id: 'pos_apocalipse', nome: 'Pós-apocalipse',
        descricao: 'Sobrevivência após uma ruptura social ou ambiental, com comunidades isoladas, infraestrutura danificada e disputa por recursos.',
        palavras_chave: ['pos apocalipse', 'pos apocaliptico', 'apocalipse', 'apocaliptico', 'zumbi', 'zumbis', 'nuclear', 'radiacao', 'devastacao', 'colapso', 'escassez', 'sobrevivencia', 'pandemia'],
        tom: 'Sobrevivência, solidariedade e escolhas difíceis.',
        regras: ['Água, alimento e equipamentos exigem conservação; seu consumo depende das regras implementadas.', 'A causa e a extensão do colapso são as definidas na premissa.'],
        classes: [
            classe('Soldado', 'Protetor treinado para defender pessoas e organizar deslocamentos.', { forca: 3, constituicao: 2, destreza: 1 }, ['golpe_preciso', 'guarda'], 1),
            classe('Mecânico', 'Especialista em aproveitar materiais e reparar equipamentos.', { inteligencia: 3, destreza: 2, constituicao: 1 }, ['percepcao', 'barreira'], 2),
            classe('Batedor', 'Explorador de rotas e recursos em áreas pouco seguras.', { destreza: 3, sabedoria: 2, constituicao: 1 }, ['passo', 'sinal'], 3),
            classe('Médico', 'Cuidador acostumado a trabalhar com recursos limitados.', { sabedoria: 3, inteligencia: 2, carisma: 1 }, ['pulso', 'guarda'], 4),
        ],
        locais: [
            ['Abrigo comunitário', 'abrigo', 'Divisórias reaproveitadas separam camas, reservas de água e uma mesa de distribuição. Um quadro registra tarefas pendentes.', 'Escassez e conflitos sobre distribuição.'],
            ['Oficina', 'oficina', 'Peças desmontadas ocupam bancadas improvisadas. Recipientes identificados guardam ferramentas e componentes úteis.', 'Material danificado e reparos arriscados.'],
            ['Trecho interditado', 'ruína', 'Uma antiga rota passa entre estruturas abandonadas. Marcas recentes sugerem que outras pessoas ainda circulam por ali.', 'Desabamentos e caminhos bloqueados.'],
        ],
        grupos: [['Conselho do abrigo', 'Moradores que coordenam recursos e tarefas.', 'Preservar a comunidade e distribuir trabalho.'], ['Rede de recuperadores', 'Exploradores e reparadores que buscam materiais.', 'Manter rotas de troca e recuperar equipamentos.']],
        contatos: [['Lia', 'Responsável pelos registros de provisões do abrigo.', 'Evitar que pessoas fiquem sem assistência.'], ['Raul', 'Mecânico que compara relatos de rotas e materiais.', 'Recuperar equipamentos sem arriscar vidas à toa.']],
        equipamentos: [['Bastão reforçado', 'arma', 'Ferramenta adaptada para defesa próxima.', 'Instrumento de combate, sem dano adicional automático.'], ['Kit de reparos', 'ferramenta', 'Ferramentas reaproveitadas e peças pequenas.', 'Permite tentar reparos com material disponível.'], ['Mochila de exploração', 'ferramenta', 'Mochila resistente com corda e marcações de rota.', 'Transporta equipamento; não aumenta atributos.'], ['Bolsa de primeiros socorros', 'ferramenta', 'Faixas e material conservado de atendimento.', 'Apoio ao cuidado; não concede cura automática.']],
        ameaca: ['Saqueador desconfiado', 'Uma pessoa que procura recursos nas áreas abandonadas.', 'Avalia riscos, exige distância e pode negociar trocas.'],
    },
].map(prepararBase);

module.exports = { BASES_RPG };
