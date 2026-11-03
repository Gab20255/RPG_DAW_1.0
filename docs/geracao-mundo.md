# Geração anterior do mundo por agentes

`npm start` abre a aplicação única. O `/novo` agora seleciona uma das cinco bases locais, adapta nomes e descrições e exibe a história inicial, sem iniciar a ficha. São até duas consultas curtas, com seleção e abertura locais em caso de falha. Esse fluxo está descrito no README. A geração por agentes documentada abaixo permanece para `/retomar`, `/expandir` e chamadas explícitas a `gerarMundo`; não faz parte do início padrão de uma aventura.

## Equipe de geração

Os agentes usam o mesmo modelo configurado em `GEMINI_MODEL`, em chamadas independentes com papéis e contratos específicos. O programa respeita as dependências abaixo e executa chamadas independentes em paralelo, com limite padrão de seis:

1. Mundo: identidade, regras do universo e planejamento de nomes, conceitos e IDs.
2. História: passado, cronologia, situação atual, conflito, objetivo, segredos e prelúdio.
3. Raças: povos, costumes, cultura e traços narrativos.
4. Facções: organizações, interesses, aliados e rivais.
5. Ambientes: mapa, cenários, recursos e perigos.
6. Itens: equipamentos ligados aos locais, recursos e culturas.
7. Classes: identidade, formação, bônus válidos, habilidades narrativas e equipamento inicial.
8. Personagens: NPCs, vínculos, aparência, personalidade, motivação e localização.
9. Criaturas: ecologia, comportamento, ameaça e habitats.
10. Missões: objetivos principais e secundários, pistas, abordagens e referências.
11. Capítulos: seis partes da campanha, com três a cinco cenas jogáveis cada.
12. Ganchos: oito situações abertas de entrada na campanha.
13. Revisão: coerência do conjunto e correções pontuais.

O perfil padrão de campanha reserva 8 classes, até 6 povos (ou nenhum, se o tema exigir), 6 facções, 24 NPCs, 18 ambientes, 24 itens, 20 criaturas e 16 missões. Cada especialista recebe o pedido original, os conceitos planejados e os dados de suas dependências. O planejamento começa por um núcleo e cresce por catálogo em chamadas pequenas. IDs e nomes são reservados antes do detalhamento. Os alvos e as referências editoriais estão em `referencias-campanha.md`.

Raças e facções podem trabalhar juntas. Depois dos ambientes, itens, NPCs e criaturas são independentes. Classes aguardam itens; missões aguardam classes, NPCs e criaturas. Capítulos aguardam missões; ganchos aguardam os capítulos e a revisão espera tudo. Lotes independentes da mesma seção também são paralelos; lotes de ambientes e facções são sequenciais. A fila é de tarefas assíncronas, apropriada para espera de rede. Não usa threads de CPU. `GENERATION_CONCURRENCY` aceita de 1 a 12 e tem padrão 6.

Os prompts estão em `src/prompts/agentesMundoPrompt.js`. A orquestração e as validações ficam em `src/services/geracaoMundoService.js`. `GeminiService.gerarMundo()` devolve o objeto consolidado, sem adicionar as chamadas dos especialistas ao histórico de conversa.

## Limites e qualidade

`AGENT_MAX_TOKENS` define o limite de resposta de cada especialista. Quando ausente, herda `WORLD_MAX_TOKENS`, com padrão de 10000. `REVIEW_MAX_TOKENS` herda o limite dos agentes quando ausente. O `.env.example` usa 10000 para mundo, especialistas, revisão e aprofundamento. O limite é por resposta, não pelo total da campanha.

O espaço de resposta deixa de ser compartilhado por todas as seções. Os prompts pedem descrições desenvolvidas, causalidade histórica, costumes, conflitos específicos, NPCs distintos e locais com identidade sensorial. Isso amplia o espaço para conteúdo, mas tamanho e qualidade ainda dependem do modelo e do limite escolhido.

O modelo padrão é `deepseek/deepseek-v4-flash`, com raciocínio desligado, esquema JSON e preferência pelo provedor mais barato. Para ele, o preço máximo permitido é US$ 0,10/M na entrada e US$ 0,20/M na saída; não há fallback automático para outro modelo. Baidu permanece excluído pelo histórico de respostas malformadas. A configuração local deve conter a chave: o terminal não usa credenciais herdadas do ambiente.

Os prompts tratam 10.000 tokens como teto, sem pedir que o modelo preencha o orçamento. A história busca 900 a 1.300 palavras somando os campos, e entidades buscam 180 a 300 palavras cada. Em cenas de capítulos, o contexto mantém a história, as facções, os povos e as entidades envolvidas com seus detalhes. Entidades fora da cena recebem conceito e fatos, sem reenviar descrição, aparência e prompt visual. Os textos completos permanecem salvos e vão integralmente à revisão. Essa redução é feita em uma cópia do contexto, sem modificar o JSON do mundo.

O campo `consumo` do progresso guarda ID da chamada, modelo, agente, tokens, custo em dólares e motivo de término retornados pelo OpenRouter. Respostas truncadas também são contabilizadas. Não se estima um custo como se fosse cobrança real; campos ausentes são `null`, e não há reconstrução do consumo anterior à mudança.

As coleções usam lotes de até dois registros por chamada. Cada capítulo usa abertura e planejamento, três a cinco chamadas de cenas e uma de desfechos. A abertura busca 200 a 350 palavras e cada cena busca 200 a 400, sem garantir o tamanho textual. O agente recebe o planejamento completo para referências, mas responde somente ao contrato da parte solicitada. O formato compacto evita gastar tokens com indentação.

Uma campanha do zero faz aproximadamente 110 a 122 chamadas no fluxo normal com seis povos e três a cinco cenas por capítulo. O total muda com povos ausentes, conteúdo herdado, recuperação de partes, subdivisões ou tentativas. O paralelismo reduz espera, não quantidade de conteúdo ou custo total. Não foi medido ganho de tempo em uma geração real. Se um lote de dois registros atingir o limite de saída, ele é dividido em chamadas individuais. Não há troca de modelo ou aumento automático de limite.

`capitulosService.js` monta capítulos sem exigir uma resposta única para todo o conteúdo. A abertura inclui um planejamento de cenas, e as cenas independentes usam a fila global de concorrência. Desfechos são produzidos depois das cenas. Cada parte tem seu próprio esquema, validação de referências e correção automática de conteúdo. O formato final em `historia.capitulos` permanece igual.

Quando uma parte de capítulo atinge o limite, `jsonParcialService.js` identifica os valores já encerrados no prefixo JSON. Apenas campos completos e válidos são preservados. A resposta restante é repartida por campos; um campo individual que ainda for cortado tem até duas tentativas adicionais com instrução de escrita mais breve. Não são completadas palavras, strings ou listas interrompidas. A retomada reaproveita `fragmentos_capitulos`, incluindo cenas parcialmente completas, e pede só os campos faltantes. Capítulos antigos já completos continuam válidos.

Interrupções de conexão como `terminated`, timeouts e erros temporários têm até três tentativas com espera. Ao esgotá-las, o diagnóstico registra o código da falha e a etapa. Um 402 permanente não é repetido. Quando a API identifica um 402 como orçamento temporário de chamadas em processamento, há repetição limitada respeitando a espera indicada, até 30 segundos por tentativa. Cada tentativa adicional é outra chamada à API.

O OpenRouter continua usando o modelo e as configurações de provedor existentes. A integração mantém saída estruturada por esquema para DeepSeek V4 Flash e raciocínio opcional desligado nessa família e nas chamadas JSON do Gemini 2.5 Flash. Outros modelos usam o modo JSON existente. O caminho Google direto mantém `responseMimeType: application/json`. A validação local independe do provedor.

## Revisão e validação

O código confere campos e tipos de cada seção, os IDs e nomes planejados, os bônus das classes (-2 a +4, até +6 positivos), referências existentes, relações recíprocas de facções, conexões recíprocas e acesso a todos os locais a partir do cenário inicial. Pelo menos um NPC deve estar nesse cenário.

`src/services/relacoesMundoService.js` centraliza os vínculos simétricos entre lotes. Uma aliança, rivalidade ou conexão declarada completa a referência de volta quando as duas entidades já estão presentes. Conflitos entre aliança e rivalidade preservam a primeira relação na ordem do catálogo; se a mesma entrada declara ambas, prevalece a rivalidade. No mapa completo, componentes desconectados recebem conexões recíprocas entre locais. Esses ajustes ficam registrados. IDs, nomes e textos são preservados, e a validação final continua obrigatória.

Uma falha na validação de lote agora inclui um diagnóstico com os IDs solicitados e a resposta gerada, para permitir investigar o conteúdo recusado sem gerar novamente as partes anteriores. A revisão deve alterar os dois lados ao remover ou substituir uma relação simétrica.

O agente de personagens define a localização oficial dos NPCs. O código calcula `ambientes[].personagens_ids`, evitando duas versões independentes da mesma relação.

`correcaoMundoService.js` equilibra bônus de classes localmente, mantendo o limite de +6 positivos e preservando penalidades válidas e textos. Também restaura nomes oficiais de IDs conhecidos, elimina referências inexistentes, repetidas ou consigo mesmo, garante referências mínimas e coloca `npc_1` no cenário inicial. No planejamento, nomes repetidos recebem um sufixo numérico, sem alterar entidades já aprovadas nem pedir outra resposta ao modelo. Essas alterações são registradas em `correcoes_automaticas`.

Uma falha restante de conteúdo recebe até duas correções pelo mesmo especialista. Se continuar inválida, `recuperacaoGeracaoService.js` aproveita campos completos e monta uma versão simplificada a partir do planejamento, tema e fatos existentes. Campos interrompidos não são apresentados como texto completo da IA: o trecho faltante recebe conteúdo local. A versão recuperada também precisa passar pela validação. Cada recuperação fica em `recuperacoes`, com etapa, escopo e motivo. Lotes cortados são subdivididos antes dessa alternativa; capítulos preservam sua recuperação por campos. Créditos, autenticação, falhas de disco, cancelamento e conexão persistente continuam sendo erros externos, com progresso salvo.

O revisor recebe o mundo inteiro. Sua saída contém `aprovado`, `observacoes` e `correcoes`, com caminhos e valores JSON para ajustes pontuais. IDs, nomes, títulos, quantidades e bônus ficam protegidos. Correções aprovadas são aplicadas a uma cópia, que passa novamente pela validação. Se a revisão for reprovada ou continuar inválida, o conteúdo estruturalmente válido pode ser salvo com `verificacao.coerencia_ia: "pendente"`; ele não é marcado como aprovado. As observações, recuperações e ajustes acompanham o JSON final. O terminal informa recuperações locais e revisão pendente.

A validação estrutural é determinística; coerência narrativa é uma avaliação do modelo e pode precisar de revisão humana.

## Progresso e retomada

Cada etapa e cada lote válido são persistidos atomicamente em um único arquivo interno em `output/geracoes`. Uma fila de gravação serializa os snapshots para evitar que respostas concorrentes sobrescrevam progresso mais novo. Lotes podem terminar fora de ordem, e a retomada procura os IDs que faltam. Recuperações locais validadas permitem continuar as dependências. Se até a versão local falhar na validação, o erro é preservado e outras tarefas independentes continuam salvando. Falhas de autenticação, crédito ou escrita interrompem novas chamadas. A função aguarda as tarefas em andamento antes de devolver o erro.

`/retomar` lista os arquivos; `/retomar "caminho/da/geracao.json"` abre um específico. O programa valida o conteúdo salvo e consulta somente as partes pendentes. Uma revisão já concluída, mesmo pendente de aprovação narrativa, é reaproveitada. Gerações antigas continuam compatíveis e mantêm seu tamanho; uma etapa completa `ambientes_itens` é migrada sem gerar novamente os dados.

`/expandir "caminho/da/geracao.json"` cria outra geração no perfil maior. Reaproveita nomes, IDs, descrições e história base; completa os catálogos e cria os capítulos. Na cópia, uma conexão liga o último local antigo ao primeiro novo para ampliar o mapa. O original fica preservado.

Depois da validação estrutural final, o programa monta um único JSON do mundo em `output/mundos`, incluindo o resultado da revisão narrativa. O arquivo interno de geração guarda planejamento e relatórios. O RPG com ficha e histórico fica em `output/rpgs`. As saídas não incluem chaves de API e são ignoradas pelo Git.

`/novo "output/mundos/arquivo.json"` reaproveita um mundo completo sem consultar a API. `/enriquecer` permanece opcional para desenvolver a escrita de um RPG já existente, criando outra versão. Essa passagem não faz parte da geração por agentes.

## JSON final, versão 1.0

| Chave | Conteúdo |
| --- | --- |
| `versao` | Versão do contrato |
| `mundo` | Nome, tema, tom, descrição, regras e ID do ambiente inicial |
| `historia` | Passado, situação atual, conflito, objetivo, prelúdio, segredos, eventos históricos e, no perfil maior, `capitulos` |
| `classes` | Identidade, bônus, habilidades narrativas e itens iniciais |
| `racas` | Espécies/povos disponíveis, ou lista vazia conforme o tema |
| `faccoes` | Organizações, objetivos, aliados e rivais |
| `personagens` | NPCs, aparência, personalidade, motivações, segredos e localização |
| `ambientes` | Locais conectados, descrições, perigos e NPCs presentes |
| `itens` | Equipamentos, efeitos sugeridos e raridades |
| `criaturas` | Fauna/inimigos, comportamento, ameaça e ambientes |
| `missoes` | Objetivos, locais, NPCs e recompensas sugeridas |
| `ganchos_aventura` | Situações abertas de entrada na campanha |
| `verificacao` | Validação estrutural, situação da revisão narrativa, observações e registros de recuperação e ajustes |

O contrato segue em `src/prompts/mundoPrompt.js`. As habilidades de classes e os efeitos de itens são ideias narrativas: o código continua responsável pelos valores e pelas ações oficiais do jogo. `personagens` representa NPCs, não jogadores. `prompt_imagem` é apenas texto, sem gerar imagem ou URL.

`historia.capitulos` é um campo adicional opcional para preparação do Mestre. Cada capítulo tem ID, título, sinopse, desenvolvimento, cenas e desfechos condicionais. Cenas contêm referências válidas a locais, NPCs, criaturas e missões, além de pistas, abordagens e consequências. O importador pode armazenar esse campo ou separá-lo por código. Ainda não há progressão automática de capítulos ou execução automática dessas consequências.
