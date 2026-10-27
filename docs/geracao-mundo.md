# Geracao inicial do mundo

Configure sua chave no `.env` e mantenha `GEMINI_MODEL` com o modelo que voce ja usa.

O limite padrao e de 3000 tokens de resposta. Voce pode configurar `WORLD_MAX_TOKENS` no `.env`. Abaixo de 4000, o prompt pede uma base inicial enxuta: 2 classes, 2 ambientes, 2 NPCs, 1 faccao, 2 itens, 1 criatura e 1 missao, mantendo todas as secoes do JSON. Os textos sao curtos para deixar margem ao fechamento do objeto. A partir de 4000, pede mais conteudo. O modelo configurado e respeitado, incluindo o sufixo `:free`.

402 significa que o saldo nao cobre o limite solicitado. Resposta interrompida por tokens significa que a geracao comecou, mas nao coube nesse limite. Sao problemas diferentes: reduzir o limite por si so nao resolve o segundo; tambem e preciso reduzir o conteudo solicitado. A quantidade real de tokens varia por tema e modelo, portanto o perfil reduzido nao garante que toda geracao caiba.

Respostas vazias e respostas cortadas agora geram mensagens distintas, com motivo de termino e uso de tokens quando fornecidos pela API. O terminal salva o conteudo parcial e esses metadados em `output/diagnosticos/`, separado dos mundos validos. Esse arquivo nao inclui chaves de API ou cabecalhos da requisicao. Nao ha nova tentativa automatica para esses casos.

Com `google/gemini-2.5-flash` no OpenRouter, a geracao do mundo desativa o raciocinio opcional para reservar os tokens ao JSON. [Controle de raciocinio no OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

Com `deepseek/deepseek-v4-flash-0731` (familia V4 Flash), o servico envia `reasoning: { enabled: false }` tanto na geracao do mundo quanto nas narracoes e mensagens. Esse modelo ativa raciocinio alto por padrao; o catalogo do OpenRouter informa que ele e opcional. Desativa-lo evita consumir o limite inteiro pensando antes de produzir texto. Isso reduz o trabalho do modelo, mas a latencia ainda depende do provedor. Outros modelos DeepSeek que exigem raciocinio nao recebem essa configuracao automaticamente.

Para uma base inicial compacta com esse modelo, use `GEMINI_MODEL=deepseek/deepseek-v4-flash-0731` e `WORLD_MAX_TOKENS=3500`. Nao e necessario aumentar o limite para 12000 ou 20000 apenas para acomodar raciocinio. Esse limite continua sendo um teto: se o proprio JSON nao couber, a resposta sera rejeitada. Os erros agora mostram tambem os tokens de raciocinio e avisam quando nao houve texto visivel. Nao ha aumento de tokens nem troca de modelo automatica.

As chamadas ao DeepSeek V4 Flash priorizam provedores por velocidade de geracao (`sort: "throughput"`) e exigem suporte aos parametros. Baidu e excluido porque devolveu JSON malformado repetidamente nos testes reais, inclusive com schema estrito. O modelo permanece o mesmo; precos e disponibilidade dependem do provedor selecionado pelo OpenRouter.

```sh
npm run mundo
```

O terminal pede uma unica descricao. Informe o tema, o tom e os detalhes desejados juntos. Exemplo: `Fantasia sombria em cidades flutuantes, com magia rara e conflitos politicos`.

Tambem pode passar tudo em um argumento:

```sh
npm run mundo -- "Cyberpunk com folclore mineiro, em Ouro Preto no ano 2099"
```

`npm run chat` agora executa esse mesmo fluxo direto. Cada execucao gera um mundo independente e termina. Nao ha dialogo, escolha de classe ou criacao de personagem de jogador.

O JSON inteiro aparece no terminal e e salvo em `output/mundos/mundo-<data>-<id>.json`, em UTF-8 e com indentacao. Arquivos anteriores sao preservados. Essa pasta e ignorada pelo Git.

## Estrutura do JSON (versao 1.0)

| Chave | Conteudo |
| --- | --- |
| `versao` | Versao do formato |
| `mundo` | Nome, tema, tom, descricao, regras do universo e ID do ambiente inicial |
| `historia` | Passado, situacao atual, conflito, objetivo, preludio, segredos e eventos historicos |
| `classes` | Opcoes futuras, bonus dos seis atributos, habilidades e itens iniciais |
| `racas` | Especies/povos disponiveis; pode ser vazia conforme o tema |
| `faccoes` | Organizacoes, objetivos, aliados e rivais |
| `personagens` | NPCs, aparencia, personalidade, motivacoes, segredos e localizacao |
| `ambientes` | Locais conectados, descricoes, perigos e NPCs presentes |
| `itens` | Catalogo de equipamentos, efeitos sugeridos e raridades |
| `criaturas` | Inimigos/fauna, comportamento, ameaca e ambientes |
| `missoes` | Objetivos principais/secundarios, locais, NPCs e recompensas |
| `ganchos_aventura` | Possibilidades para iniciar a campanha depois |

As colecoes usam IDs para voce separar e relacionar os dados por codigo futuramente. `prompt_imagem` e apenas texto para uma futura geracao de imagens. A ficha do jogador e a escolha de classe/raca acontecem em outra etapa.

O formato e o prompt estao em `src/prompts/mundoPrompt.js`. O metodo `GeminiService.gerarMundo(tema)` retorna um objeto JavaScript com o JSON ja interpretado, sem adicionar mensagens ao historico do chat.

Ha validacao de estrutura/tipos e das referencias por ID antes de salvar. Pequenos erros de sintaxe, como um colchete faltando no meio de um objeto encerrado, sao tratados com [jsonrepair](https://github.com/josdejong/jsonrepair), sem outra chamada a IA. Respostas cortadas pelo limite de tokens, vazias ou com estrutura incompleta geram erro e nao sao salvas como mundo.

O modo JSON do OpenRouter usa `response_format: { type: "json_object" }`; o modelo/provedor escolhido precisa aceitar esse parametro. Para gerar mundos com DeepSeek V4 Flash, usa `json_schema` estrito, derivado de `MODELO_MUNDO`, e `provider.require_parameters: true` para selecionar provedores que aceitam os parametros. Isso reforca a estrutura sem pedir uma segunda geracao para corrigir campos. A validacao local dos campos e referencias continua obrigatoria. O caminho Google direto usa `responseMimeType: "application/json"`.

Referencias: [OpenRouter - parametros](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/parameters.mdx) e [Google - saida estruturada](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

Para conferir o contrato e os casos de erro sem chamadas de API:

```sh
npm test
```
