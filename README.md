# RPG de texto pelo terminal

Criação de mundo, escolha de personagem, narração e salvamento funcionam na mesma aplicação.

```powershell
npm install
npm start
```

Esta é a estrutura funcional do projeto para validação pelo terminal. A interface visual será feita em outra etapa. A descrição dos comandos e o roteiro de verificação manual estão abaixo.

## Começar, continuar e editar

| Comando | O que faz |
| --- | --- |
| `/novo` | Recebe nome, história e tom, seleciona e adapta uma base pronta, salva e exibe a história inicial. |
| `/novo "caminho/do/mundo.json"` | Copia um mundo existente e exibe sua abertura, sem consultar a IA nem criar personagem. |
| `/retomar` | Lista gerações salvas e continua a escolhida a partir da primeira etapa pendente. |
| `/retomar "caminho/da/geracao.json"` | Continua uma geração específica, preservando as etapas já concluídas. |
| `/expandir "caminho/da/geracao.json"` | Cria uma cópia de uma geração antiga no perfil de campanha, reaproveitando o conteúdo pronto. |
| `/carregar` | Lista histórias iniciais, RPGs salvos e fichas antigas que podem ser importadas. |
| `/carregar nome` | Procura o RPG pelo nome. Se houver mais de uma versão, oferece a seleção. |
| `/editar` | Edita o RPG aberto. Sem um RPG aberto, oferece a seleção. |
| `/editar nome` | Abre outro RPG salvo para edição. |
| `/listar` | Mostra as aventuras e suas versões. |
| `/salvar` | Salva o RPG aberto. O programa também salva automaticamente. |
| `/sair` | Encerra o terminal. |

Durante uma criação ou edição, `/cancelar` cancela a etapa e volta ao menu. O RPG que já estava aberto continua preservado. O nome e a aparência podem ser editados sem zerar o histórico. Trocas de classe, origem ou habilidades e alterações do mundo criam uma nova versão, no início da aventura; a versão anterior permanece disponível em `/carregar`.

Para usar um mundo já existente sem consultar a IA, informe o caminho junto ao comando: `/novo "output/mundos/arquivo.json"`.

## Comandos durante a partida

| Comando | O que faz |
| --- | --- |
| `/resumo` | Mostra mundo, personagem, localização e recursos. |
| `/mundo` | Exibe história, objetivo, cenário inicial, locais, NPCs e demais dados públicos do mundo. |
| `/ficha` | Exibe identidade, atributos e inventário inicial. |
| `/habilidades` | Exibe poderes escolhidos, custos, alcance, recarga e limitações. |
| `/locais` | Lista o cenário atual e as conexões permitidas. |
| `/observar` | Pede ao Mestre uma narração do cenário. |
| `/falar texto` | Conversa com NPCs presentes. |
| `/teste forca abrir a porta` | O código rola D20 e resolve o teste. |
| `/ir 1` | O código valida a conexão e registra a transição. |
| `/repetir` | Reutiliza o último resultado sem uma nova rolagem; se a narração já existe, não consulta a IA. |
| `/historico` | Mostra os últimos acontecimentos. |
| `/contexto` | Exporta o contexto completo do Mestre sem consultar a API. |
| `/enriquecer` | Aprofunda a escrita do mundo em uma nova versão, mantendo o RPG anterior. |

Texto livre é uma intenção do personagem. O Mestre pode descrever e reagir, mas não aplica resultados mecânicos que o código ainda não sabe resolver.

## Bases prontas: fluxo padrão

`/novo` faz no máximo duas consultas curtas, sem histórico de conversa e sem novas tentativas:

1. Seleção: título, história, tom e um catálogo resumido das cinco bases. A IA devolve o ID escolhido, com teto de **120 tokens de saída** e prazo de 15 segundos.
2. Adaptação: somente a premissa e os IDs, nomes e descrições das quatro classes, dois NPCs e três locais da base escolhida. A resposta muda nomes de classes, nomes e descrições curtas dos NPCs e locais, e escreve uma abertura de aproximadamente 100 a 160 palavras. Teto de **1.400 tokens de saída** e prazo de 30 segundos.

São no máximo 1.520 tokens de saída solicitados no fluxo normal, além dos tokens de entrada cobrados pelo provedor. Os limites não são metas de consumo. `WORLD_MAX_TOKENS` e `AGENT_MAX_TOKENS` não aumentam esses tetos. Não são enviados atributos, inventário, histórico completo ou as cinco bases inteiras à adaptação.

| Base | Classes prontas |
| --- | --- |
| Fantasia medieval | Guerreiro, Mago, Ladino e Clérigo |
| Fantasia sombria | Guerreiro, Caçador, Ocultista e Curandeiro |
| Ficção científica | Soldado, Engenheiro, Batedor e Médico |
| Investigação contemporânea | Investigador, Policial, Jornalista e Médico |
| Pós-apocalipse | Soldado, Mecânico, Batedor e Médico |

Cada base tem quatro classes com bônus válidos, três locais conectados, dois NPCs, duas facções, cinco itens, uma ameaça, uma missão inicial aberta e dois ganchos. Não há capítulos, finais ou uma campanha inteira gerados antecipadamente. As definições estão em `src/data/basesRpg.js`; a seleção e a montagem local ficam em `src/services/basesRpgService.js`.

O título, a história e o tom são preservados em `premissa`. O código aplica apenas os campos narrativos permitidos, valida IDs, quantidades e nomes e preserva bônus, habilidades, equipamentos, regras e conexões. Não aceita entidades extras ou alterações mecânicas vindas da adaptação. Nomes antigos em descrições da base são atualizados localmente. A abertura fica em `historia.preludio`; `preparacao.etapa` é `historia_inicial`, e `preparacao.proxima_etapa` é `participantes`.

Se a seleção falhar, o programa escolhe localmente por palavras da história, título e tom, nessa ordem de peso, e não faz a consulta de adaptação. Empates seguem a ordem do catálogo; sem correspondências, usa fantasia medieval. Se somente a adaptação falhar, a base já selecionada é preservada. A abertura local combina a premissa com a introdução pronta, sem prometer uma adaptação pela IA. Os estados ficam em `origem.selecao` e `preparacao.adaptacao`, com motivos locais no JSON e identificação no terminal.

O mundo é salvo em `output/mundos/mundo-base-*.json`, sem criar um checkpoint de agentes. O terminal exibe a história inicial e volta ao comando. Neste fluxo, ainda não pergunta quantidade de jogadores, classe ou dados de ficha; essas serão as próximas etapas. `/listar`, `/carregar`, `/resumo`, `/mundo` e `/salvar` também funcionam com essas preparações, sem novas chamadas à IA. RPGs antigos com ficha continuam usando o fluxo anterior de edição e narração.

A narração atual permanece funcionando. A criação progressiva de conteúdo, a memória ampliada da campanha e a resolução completa de ações livres são etapas posteriores (issues 2 e 3).

## Geração anterior por agentes

O fluxo anterior permanece disponível para `/retomar` e `/expandir`, que podem consumir muitas chamadas. Ele não é executado pelo novo `/novo`. Os especialistas usam chamadas independentes ao modelo configurado, com papel, prompt, contrato de saída e limite de resposta próprios. Uma fila assíncrona executa até seis chamadas simultâneas, respeitando dependências. Lotes independentes da mesma seção também rodam em paralelo, inclusive classes, itens, NPCs, criaturas, missões e capítulos. Ambientes e facções mantêm seus lotes sequenciais para coordenar os vínculos. Como as tarefas esperam a API, a concorrência usa promessas e não exige processos ou threads de CPU.

| Agente | Responsabilidade |
| --- | --- |
| Mundo | Identidade do universo, regras e planejamento dos IDs, nomes e conceitos de todas as entidades. |
| História | Passado, cronologia, situação atual, conflito, objetivo, segredos e prelúdio. |
| Raças | Povos, culturas, costumes e traços narrativos. |
| Facções | Organizações, objetivos, alianças e rivalidades. |
| Ambientes | Locais conectados, descrições, perigos e recursos. |
| Itens | Equipamentos relacionados aos locais, às culturas e às classes. |
| Classes | Identidade, formação, papel social, ideias de habilidades e itens iniciais. |
| Personagens | NPCs, aparência, personalidade, motivações, segredos e localização. |
| Criaturas | Ecologia, comportamento, ameaças e habitats. |
| Missões | Missões principais e secundárias com objetivos, pistas, obstáculos e alternativas. |
| Capítulos | Seis partes do arco, cada uma com três a cinco cenas jogáveis e desfechos condicionais. |
| Ganchos de aventura | Oito situações de entrada abertas às decisões dos jogadores. |
| Revisão | Coerência do conjunto e correções pontuais, sem reescrever o mundo inteiro. |

O perfil padrão reserva 8 classes, até 6 povos (ou nenhum, conforme o tema), 6 facções, 24 NPCs, 18 ambientes, 24 itens, 20 criaturas e 16 missões. O agente de capítulos desenvolve seis capítulos, com 18 a 30 cenas ao todo. A abertura busca cerca de 200 a 350 palavras e cada cena busca 200 a 400, sem garantia de que o modelo cumpra esse tamanho. Essas quantidades são decisões do projeto, não uma média universal de RPGs publicados. A pesquisa e os critérios estão em `docs/referencias-campanha.md`.

O planejamento é ampliado por catálogo em chamadas pequenas, evitando pedir todos os nomes e descrições em uma resposta. Raças e facções podem ser geradas lado a lado. Depois dos ambientes, itens, NPCs e criaturas também trabalham em paralelo. Classes aguardam itens; missões aguardam classes, NPCs e criaturas; capítulos aguardam missões; a revisão espera o conjunto completo. Cada agente recebe o pedido, o planejamento e os dados de suas dependências, sem depender da ordem casual de término das outras chamadas.

O código mantém IDs e nomes, valida os bônus das classes, as referências e a conectividade do mapa. Alianças, rivalidades e conexões são centralizadas: quando um lote declara um vínculo com uma entidade de outro lote, o código completa a referência de volta sem gerar novamente suas descrições. Uma facção não pode ser aliada e rival da mesma outra facção. IDs inexistentes e mapas desconectados precisam ser corrigidos antes da conclusão. As listas de NPCs dos ambientes são calculadas a partir da localização oficial dos NPCs. O revisor pode corrigir textos e referências; não pode trocar IDs primários, nomes, quantidades ou bônus. Para remover um vínculo simétrico, a revisão precisa retirar as referências dos dois lados. A revisão por IA ajuda a encontrar contradições narrativas, mas não garante que toda frase esteja correta.

Erros previsíveis são corrigidos localmente. Bônus são convertidos para inteiros entre -2 e +4; quando a soma positiva passa de +6, o orçamento é redistribuído proporcionalmente, mantendo as penalidades válidas. Nomes de IDs conhecidos voltam ao nome oficial. Novos nomes repetidos no planejamento recebem um sufixo numérico. Referências inválidas são filtradas, relações conflitantes são conciliadas pela ordem do catálogo e componentes desconectados do mapa recebem conexões. Essas correções não exigem outra chamada à IA e ficam em `correcoes_automaticas`.

Para erros de conteúdo que persistirem, o programa pede até duas correções somente do escopo afetado. Depois, aproveita campos completos da resposta e preenche o trecho necessário com uma versão local simplificada, baseada no planejamento e no tema. O restante não é gerado novamente. Cada recuperação fica registrada em `recuperacoes` e passa pela validação antes de continuar. Crédito, autenticação, armazenamento, cancelamento ou indisponibilidade persistente da API ainda podem impedir a conclusão. Erros inesperados do código não são tratados como conteúdo válido.

As coleções são desenvolvidas em lotes de até dois registros por chamada. Cada capítulo é montado com abertura e planejamento, cenas individuais e desfechos, em vez de pedir o capítulo inteiro em uma resposta. Cada parte válida é salva em `output/geracoes`, mesmo quando os resultados chegam fora de ordem. A retomada identifica registros e campos que faltam. As gravações passam por uma fila única para evitar sobreposição de versões concorrentes. Se uma resposta de dois registros for cortada, ela é dividida em chamadas individuais, preservando os lotes anteriores e o limite de tokens.

Nos capítulos, uma parte cortada é dividida novamente por campos. O programa recupera somente valores JSON completos, sem completar palavras ou inventar fechamentos. Campos incompletos são solicitados separadamente; um campo individual ainda cortado recebe até duas tentativas adicionais com instrução de escrita mais breve. Aberturas, cenas e capítulos já salvos são preservados. O progresso interno usa `fragmentos_capitulos`, que não faz parte do JSON final do mundo.

Falhas transitórias de conexão, inclusive `terminated`, têm até três tentativas com espera. Ao esgotá-las, o diagnóstico registra o código de rede e a etapa. Erros temporários do provedor e limites de requisições também têm repetição limitada. Erros permanentes de crédito ou limite da chave não são repetidos; um 402 identificado como orçamento temporário de chamadas em processamento respeita a espera indicada, limitada a 30 segundos por tentativa. Cada nova tentativa é outra chamada à API.

`/retomar` mantém o tamanho de gerações antigas e reutiliza seus lotes. `/expandir "arquivo.json"` cria outra geração no perfil maior: preserva descrições, nomes, IDs e histórico já escrito, acrescenta as entidades faltantes e desenvolve os capítulos. Na cópia, uma conexão liga o último local antigo ao primeiro novo. O arquivo original permanece preservado. O contador de etapas pode avançar fora da ordem de exibição, pois tarefas independentes terminam em paralelo.

O JSON é salvo em `output/mundos` após a validação estrutural. Uma revisão narrativa inconclusiva permite continuar com `verificacao.coerencia_ia: "pendente"`, mantendo as observações e os registros de recuperação no próprio JSON. O terminal mostra essa situação; ela não é apresentada como aprovação. Em um RPG já criado, `/enriquecer` continua disponível como passagem literária opcional. Não há troca de modelo ou aumento automático de tokens após uma falha.

A ordem é nome da aventura → história/tema e tom → mundo, história, objetivo, locais e cenário inicial → personagem. O terminal usa apenas rótulos e dados, sem banners, dicas ou orientações de preenchimento. O cenário inclui um prompt visual em texto; nenhuma imagem é gerada nesta etapa.

O prompt deixou de limitar descrições a seis palavras. A narração agora prioriza detalhes concretos, continuidade, costumes, vozes distintas dos NPCs e consequências imediatas. O tamanho varia com a cena. Com o limite padrão de 1.600 tokens de narração, o prompt busca aproximadamente 250 a 400 palavras para cenas desenvolvidas; isso é uma orientação, não uma garantia de tamanho ou qualidade.

O contexto inclui descrições do mundo, da classe e da origem, cenário, NPCs presentes, ações anteriores e seus resultados. As regras continuam separadas da escrita: números, inventário e mapas não são alterados pela resposta do modelo.

## Configuração

Configure a chave no `.env` da raiz do projeto. As entradas de terminal leem as credenciais exclusivamente desse arquivo. Em `/novo`, arquivo ausente ou chave vazia levam à seleção local da base; a narração e a geração antiga continuam exigindo chave. Chaves herdadas do Windows ou do editor não são usadas. As demais opções locais têm prioridade sobre o ambiente.

O modelo padrão no OpenRouter é `deepseek/deepseek-v4-flash`, com raciocínio desligado e esquema JSON nas etapas de geração. O roteamento prioriza preço e, para esse modelo, aceita até US$ 0,10 por milhão de tokens de entrada e US$ 0,20 por milhão de saída. Em 02/11/2026, o endpoint StreamLake anunciava US$ 0,07/M na entrada e US$ 0,14/M na saída no [OpenRouter](https://openrouter.ai/deepseek/deepseek-v4-flash). O preço efetivo depende do endpoint disponível. Baidu permanece excluído devido ao histórico de respostas malformadas. Se não houver provedor compatível dentro do teto, a API recusa a chamada. Não existe substituição automática por um modelo mais caro.

O teto de 10.000 tokens pertence à geração antiga e ao aprofundamento opcional, não à seleção de base do `/novo`. É espaço disponível por resposta, não uma meta de escrita nem o consumo cobrado automaticamente. A geração antiga registra em `consumo` no arquivo de progresso os tokens e o custo retornados pela API, inclusive de respostas truncadas. Valores não informados ficam `null`; chamadas antigas não têm esse registro.

| Variável | Uso |
| --- | --- |
| `OPENROUTER_API_KEY` | Chave do OpenRouter. Tem prioridade quando preenchida. |
| `GEMINI_API_KEY` | Alternativa para Google direto. |
| `GEMINI_MODEL` | Identificador do modelo. Padrão OpenRouter: `deepseek/deepseek-v4-flash`. |
| `WORLD_MAX_TOKENS` | Limite por agente quando `AGENT_MAX_TOKENS` estiver ausente. Padrão: 10.000. |
| `AGENT_MAX_TOKENS` | Limite da resposta de cada especialista. Herda `WORLD_MAX_TOKENS` quando ausente. |
| `REVIEW_MAX_TOKENS` | Limite da resposta do revisor. Herda o limite dos agentes quando ausente. |
| `GENERATION_CONCURRENCY` | Chamadas simultâneas: padrão 6, valores de 1 a 12. |
| `ENRICHMENT_MAX_TOKENS` | Limite da passagem literária opcional em `/enriquecer`. Na entrada única, herda o limite do mundo quando ausente. |
| `NARRATION_MAX_TOKENS` | Limite de cada narração. Padrão na entrada única: 1.600. |

O perfil maior da geração antiga exige aproximadamente **110 a 122 chamadas** no fluxo normal com seis povos e três a cinco cenas por capítulo, incluindo planejamento e desfechos. Esse fluxo não é usado pelo `/novo`. Quantidade menor de povos, expansão de arquivos existentes, subdivisões, recuperação de conteúdo e tentativas alteram esse total. O paralelismo reduz a espera das tarefas independentes; não reduz a quantidade de conteúdo ou o custo total. Retomar consulta somente as partes pendentes. As consultas locais e a criação da ficha não usam a API.

## Arquivos salvos

`output/rpgs` contém cada RPG completo: mundo, ficha, histórico, localização e metadados de edição. Ele pode ser carregado mesmo sem o JSON original do mundo. Não apague essa pasta se quiser preservar as aventuras.

`output/mundos` mantém um JSON consolidado por geração. As coleções existentes continuam no formato `1.0`; campanhas acrescentam o campo opcional `historia.capitulos`. Ele contém cenas, referências, pistas, abordagens, consequências e desfechos para preparação do Mestre. Esses dados ainda não constituem um motor automático de progressão de capítulos. O importador do banco pode armazenar esse campo ou tratá-lo separadamente. Planejamento, respostas intermediárias e revisão ficam no arquivo de progresso em `output/geracoes`. Contextos e diagnósticos mantêm suas pastas anteriores. As saídas são ignoradas pelo Git.

Fichas antigas de `output/personagens` aparecem em `/carregar`. Quando existir uma partida compatível em `output/partidas`, seu histórico também é importado. Os arquivos antigos não são apagados.

## Estado atual do projeto

O início atual seleciona e adapta uma das cinco bases, exibe a abertura e salva a preparação sem personagens. Em RPGs anteriores com ficha, continuam disponíveis revisão de personagem, duas habilidades de um catálogo de 12, edição de versões, narração, testes D20 locais, transições e histórico. A geração antiga e o aprofundamento continuam opcionais. O protótipo mantém estado oficial e narração separados.

O catálogo cobre sete categorias e valida custo, orçamento e desbloqueio. Ainda não há execução completa de habilidades em combate, dano em alvos, efeitos persistentes, progressão completa, multiplayer, autenticação, integração da aplicação com o banco, geração de imagens ou interface visual. A dificuldade dos testes do protótipo continua fixa em 12.

## Roteiro para testar manualmente

1. Execute `npm start` e digite `/novo` dentro do programa.
2. Preencha `Nome`, `História` e `Tom`. Confira a base escolhida e a história inicial. Não devem aparecer agentes de geração completa nem perguntas de ficha.
3. Use `/mundo` para conferir nomes adaptados e `/resumo` para conferir a etapa atual.
4. Encerre com `/sair`, execute `npm start` novamente e use `/carregar` para abrir a mesma história sem gerar outra resposta.
5. Para testar narração e mecânicas já existentes, carregue um RPG antigo com ficha. `/observar`, `/falar` e `/teste` continuam consultando a IA para narrar.

O campo de comando é `>`. Preparações ficam em `output/mundos`; RPGs com ficha ficam em `output/rpgs`.
