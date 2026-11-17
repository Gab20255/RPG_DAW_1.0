// As descrições registram o que aparece nos arquivos P01–P60. Os papéis são sugestões de uso no RPG.
const grupos = {
    fantasia_medieval: [
        ['P01', 'Guardião de aço', 'Homem adulto, pele morena, cabelo castanho curto, barba curta e armadura de placas prateadas sobre tecido verde.', 'guerreiro, cavaleiro, guarda, protetor'],
        ['P02', 'Estudiosa arcana', 'Mulher de pele clara, cabelo ruivo solto, manto azul-petróleo com capuz e broche prateado de cristal.', 'maga, bruxa, feiticeira, arcano, estudiosa'],
        ['P03', 'Viajante discreta', 'Mulher de pele negra, cabelo crespo preso no alto, capa verde, lenço escuro e túnica de couro marrom.', 'ladina, batedora, mensageira, exploradora'],
        ['P04', 'Curandeiro do templo', 'Homem maduro de cabelo grisalho longo e ondulado, barba cinza, veste verde e bege e medalhão redondo.', 'curandeiro, clérigo, druida, sacerdote'],
        ['P05', 'Patrulheira da floresta', 'Mulher de pele negra com tranças presas, capa verde-musgo e ombreira de couro.', 'patrulheira, guarda florestal, arqueira, rastreadora'],
        ['P06', 'Artesão anão', 'Homem de rosto largo, barba espessa grisalha, óculos de proteção na testa e avental de couro.', 'anão, ferreiro, artesão, mecânico'],
        ['P07', 'Diplomata élfica', 'Elfa de pele castanha, cabelos escuros longos, orelhas pontudas e capa azul-petróleo com fecho metálico.', 'elfa, diplomata, nobre, conselheira'],
        ['P08', 'Combatente orc', 'Orc de pele verde-acinzentada, presas inferiores, cabelo preto curto e armadura de couro marrom.', 'orc, guerreiro, mercenário, guardião'],
        ['P09', 'Navegadora do porto', 'Mulher de pele morena e cabelos escuros presos, casaco azul-marinho, lenço claro e alça transversal.', 'marinheira, navegadora, comerciante, viajante'],
        ['P10', 'Viajante do deserto', 'Homem de pele escura com barba e bigode, turbante e lenço bege sobre roupas terrosas e correias.', 'guia, mercador, viajante, explorador do deserto'],
        ['P11', 'Artista itinerante', 'Homem de pele clara, cabelo ruivo ondulado e barba ruiva, colete vinho, camisa creme e capa marrom.', 'bardo, artista, músico, viajante'],
        ['P12', 'Habitante da vila', 'Mulher de pele morena, cabelos castanhos cacheados presos, blusa de linho, colete gasto e xale cinza.', 'aldeã, artesã, comerciante, trabalhadora'],
    ],
    fantasia_sombria: [
        ['P13', 'Sentinela da névoa', 'Mulher de pele clara, cabelo preto curto, cicatriz na sobrancelha, armadura de ferro escuro e tecido vinho.', 'sentinela, guerreira, guarda, cavaleira'],
        ['P14', 'Rastreador noturno', 'Homem moreno de barba curta, rosto à sombra de um capuz e capa verde-acinzentada presa sobre couro.', 'rastreador, caçador, ladino, batedor'],
        ['P15', 'Pesquisadora do oculto', 'Mulher de pele negra, tranças longas, manto violeta de gola alta e pingente de pedra roxa.', 'ocultista, feiticeira, maga, pesquisadora'],
        ['P16', 'Curandeiro do refúgio', 'Homem idoso de pele morena, cabelo e barba brancos, óculos redondos, xale verde e correia marrom.', 'curandeiro, médico, cuidador, herbalista'],
        ['P17', 'Caçador de criaturas', 'Homem de pele negra e cabelo raspado, casaco de couro marrom de gola alta com fivelas e tiras cruzadas.', 'caçador, patrulheiro, rastreador, mercenário'],
        ['P18', 'Nobre decadente', 'Mulher madura de pele clara, cabelo escuro preso com mechas prateadas, casaco austero e broche metálico.', 'nobre, diplomata, conselheira, aristocrata'],
        ['P19', 'Guardião funerário', 'Homem idoso de cabelo e barba brancos, casaco de lã escura, lenço marrom e pingente redondo.', 'guardião, coveiro, vigia, zelador'],
        ['P20', 'Peregrino penitente', 'Jovem de cabelo loiro curto penteado para trás, capuz bege abaixado, túnica remendada e colar com pequeno pingente.', 'peregrino, monge, penitente, viajante'],
        ['P21', 'Alquimista reservado', 'Jovem de cabelo grisalho curto, óculos de proteção na testa, roupa azul-escura e avental de couro com rebites.', 'alquimista, inventor, artesão, técnico'],
        ['P22', 'Exilada feérica', 'Elfa de pele acinzentada, cabelos brancos presos, orelhas pontudas, capa cinza e fecho prateado oval.', 'elfa, exilada, criatura feérica, feiticeira'],
        ['P23', 'Mercenária veterana', 'Mulher de pele negra, cabelo muito curto, cota de malha, couraça gasta e ombreira de aço.', 'mercenária, guerreira, protetora, veterana'],
        ['P24', 'Sobrevivente apreensivo', 'Homem de pele clara, cabelo preto desalinhado e barba rala, casaco verde remendado e cachecol cinza.', 'sobrevivente, civil, viajante, aldeão'],
    ],
    ficcao_cientifica: [
        ['P25', 'Soldado orbital', 'Homem de pele negra, cabelo raspado, armadura tecnológica grafite sobre uniforme azul e gola rígida.', 'soldado, guarda, combatente, segurança'],
        ['P26', 'Engenheira de sistemas', 'Mulher de pele negra, cabelo preso no alto, óculos na testa, jaqueta acolchoada e módulos eletrônicos no peito.', 'engenheira, mecânica, técnica, hacker'],
        ['P27', 'Exploradora orbital', 'Pessoa de pele morena e cabelo curto encaracolado, traje espacial bege de gola alta e rádio no ombro.', 'exploradora, astronauta, batedora, piloto'],
        ['P28', 'Médica de bordo', 'Mulher madura de cabelo grisalho preso, traje branco com linhas verde-água e dispositivo na alça do ombro.', 'médica, socorrista, cuidadora, cientista'],
        ['P29', 'Piloto de transporte', 'Mulher morena de cabelo preto curto e assimétrico, jaqueta escura de gola alta e alças de voo.', 'piloto, transportadora, navegadora, mercenária'],
        ['P30', 'Especialista digital', 'Mulher de pele negra, cabelo assimétrico preto, implante brilhante azul na têmpora e jaqueta preta tecnológica.', 'hacker, especialista digital, cyberpunk, infiltradora'],
        ['P31', 'Cientista de campo', 'Homem maduro com cabelo e barba grisalhos, jaqueta cinza-bege e sensor quadrado no centro do peito.', 'cientista, pesquisador, técnico, perito'],
        ['P32', 'Colona espacial', 'Mulher de pele bronzeada, cabelo castanho em coque, macacão bege e arnês escuro cruzando o peito.', 'colona, trabalhadora, exploradora, técnica'],
        ['P33', 'Diplomata interestelar', 'Pessoa de pele negra e cabeça raspada, uniforme formal azul-escuro de gola alta e fecho metálico pequeno.', 'diplomata, representante, capitã, conselheira'],
        ['P34', 'Androide de serviço', 'Robô humanoide de placas prateadas no rosto, olhos âmbar, pescoço mecânico e uniforme utilitário azul.', 'androide, robô, sintético, assistente'],
        ['P35', 'Viajante extraterrestre', 'Humanoide alienígena de pele azul-acinzentada, olhos escuros, cristas na cabeça e jaqueta marrom de gola alta.', 'alienígena, extraterrestre, explorador, viajante'],
        ['P36', 'Agente cibernética', 'Mulher de cabelo preto curto, implante discreto na têmpora, colete preto de bolsos e camisa cinza.', 'agente, segurança, guarda, infiltradora'],
    ],
    investigacao_contemporanea: [
        ['P37', 'Investigador de rua', 'Homem de pele negra, cabelo curto e barba com fios grisalhos, óculos finos, jaqueta cinza e camiseta azul.', 'investigador, detetive, perito, informante'],
        ['P38', 'Agente de proteção', 'Mulher de pele negra, cabelo preso, rádio de ombro e colete tático escuro sobre uniforme azul.', 'agente, policial, guarda, segurança'],
        ['P39', 'Repórter de campo', 'Mulher de cabelo castanho ondulado na altura do queixo, jaqueta verde-oliva, alça e credencial lisa.', 'repórter, jornalista, fotógrafa, investigadora'],
        ['P40', 'Socorrista', 'Homem ruivo de pele clara, cabelo curto penteado e uniforme de emergência azul com faixas finas claras.', 'socorrista, paramédico, médico, enfermeiro'],
        ['P41', 'Perita de laboratório', 'Mulher madura de cabelo grisalho preso, óculos transparentes na cabeça e jaleco claro sobre camisa cinza.', 'perita, cientista, médica, pesquisadora'],
        ['P42', 'Técnico de manutenção', 'Homem de pele negra, cabelo e barba curtos, protetores auriculares vermelhos no pescoço e jaqueta de trabalho.', 'técnico, mecânico, engenheiro, operário'],
        ['P43', 'Pesquisador acadêmico', 'Homem idoso de pele clara, cabelo branco curto, óculos redondos e suéter marrom sobre camisa clara.', 'pesquisador, professor, acadêmico, historiador'],
        ['P44', 'Guia de expedição', 'Mulher morena de cabelos escuros presos, jaqueta verde e mochila de trilha com alças acolchoadas.', 'guia, exploradora, montanhista, rastreadora'],
        ['P45', 'Segurança particular', 'Homem de cabeça raspada, barba rala, jaqueta preta sobre camiseta cinza e ponto eletrônico na orelha.', 'segurança, guarda-costas, vigia, agente'],
        ['P46', 'Comerciante local', 'Mulher madura de pele negra, cabelo crespo curto, avental bege sobre cardigã e blusa estampada.', 'comerciante, vendedora, cozinheira, civil'],
        ['P47', 'Mensageira urbana', 'Mulher de pele clara, cabelo castanho curto, jaqueta azul de gola alta e alça larga transversal.', 'mensageira, entregadora, exploradora, civil'],
        ['P48', 'Civil versátil', 'Mulher de pele negra, cabelo escuro ondulado na altura dos ombros, jaqueta bege e camiseta cinza.', 'civil, moradora, viajante, testemunha'],
    ],
    pos_apocalipse: [
        ['P49', 'Protetor das ruínas', 'Homem de cabelo preto penteado para trás, armadura improvisada de metal e couro com faixa escura transversal.', 'protetor, soldado, guerreiro, guarda'],
        ['P50', 'Mecânica do abrigo', 'Mulher de pele negra e cabelos presos, óculos de proteção na testa, jaqueta marrom remendada e alças de couro.', 'mecânica, engenheira, técnica, reparadora'],
        ['P51', 'Batedor do ermo', 'Homem de cabelo e barba castanhos, lenço verde no pescoço, colete de couro, correia e ombreira gasta.', 'batedor, explorador, caçador, rastreador'],
        ['P52', 'Cuidadora do abrigo', 'Mulher madura de cabelo grisalho, lenço verde e avental marrom com rolos de tecido no bolso.', 'cuidadora, médica, curandeira, socorrista'],
        ['P53', 'Coletora de recursos', 'Mulher de cabelo preto curto, colete verde-oliva com bolsos e mochila presa por tiras marrons.', 'coletora, exploradora, catadora, batedora'],
        ['P54', 'Agricultor sobrevivente', 'Homem idoso de pele negra e barba grisalha, chapéu marrom de aba larga, camisa de trabalho e mochila.', 'agricultor, fazendeiro, guia, sobrevivente'],
        ['P55', 'Negociante itinerante', 'Pessoa de pele morena e cabelo escuro em coque alto, lenço azul-acinzentado e casaco marrom com muitos bolsos.', 'negociante, comerciante, mercadora, viajante'],
        ['P56', 'Guarda do assentamento', 'Mulher de pele clara e cabelo preto curto, lenço verde, colete com bolsos, placa peitoral e ombreira metálicas.', 'guarda, vigilante, guerreira, protetora'],
        ['P57', 'Pesquisadora de contaminação', 'Mulher de pele negra e cabelo raspado, traje azul protetor com capuz abaixado e respirador no peito.', 'pesquisadora, cientista, especialista em contaminação, exploradora'],
        ['P58', 'Navegador das terras secas', 'Homem maduro de cabelo grisalho, óculos de poeira na testa e poncho bege envelhecido.', 'navegador, guia, explorador do deserto, sobrevivente'],
        ['P59', 'Sobrevivente alterado', 'Humanoide de pele cinza, cabelo escuro curto, cachecol cinzento e colete de couro marrom.', 'mutante, sobrevivente, viajante, civil'],
        ['P60', 'Organizadora comunitária', 'Mulher madura de pele morena e cabelo escuro com mechas grisalhas, jaqueta verde, cachecol e alça transversal.', 'líder, organizadora, negociadora, sobrevivente'],
    ],
};

const arquivosPng = new Set(['P01', 'P02', 'P03', 'P04', 'P13', 'P14', 'P15', 'P16']);

const CATALOGO_AVATARES = Object.freeze(Object.entries(grupos).flatMap(([base_id, retratos]) =>
    retratos.map(([id, nome, descricao, papeis]) => Object.freeze({
        id, nome, descricao, base_id,
        papeis: Object.freeze(papeis.split(', ')),
        url: `/avatares/${id}.${arquivosPng.has(id) ? 'png' : 'jpeg'}`,
    }))));

module.exports = { CATALOGO_AVATARES };
