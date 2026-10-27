# Seleção de personagem e contexto do Mestre pelo terminal

Esta implementação conclui o fluxo de seleção da Issue #7 e a integração dos poderes e limites criativos da Issue #8 para o protótipo de terminal. A persistência no banco e a interface visual são etapas separadas.

## Criar o personagem

```powershell
npm run personagem
```

`npm start` abre o mesmo assistente. Nenhuma chave de API é necessária para essa etapa.

O fluxo lista os JSONs válidos de `output/mundos`, permite selecionar a classe e o povo/origem, solicita nome e aparência, apresenta o catálogo mecânico e pede duas habilidades. Na revisão é possível trocar identidade, classe, origem ou habilidades. Digitar `/sair` ou cancelar não salva um personagem incompleto.

Também é possível informar um mundo diretamente:

```powershell
npm run personagem -- "C:\caminho\mundo.json"
```

A ficha completa é salva como um único JSON em `output/personagens`. Inclui atributos, vida, energia, itens iniciais, habilidades validadas, versão das regras, origem do mundo e hash do JSON. Os NPCs do mundo continuam separados da ficha do jogador. O arquivo está pronto para outro integrante adaptar à camada de persistência.

As descrições de habilidades geradas no mundo são ideias narrativas. As habilidades da ficha são escolhidas do catálogo mecânico do projeto, evitando transformar uma descrição em vantagem numérica.

## Regras iniciais de habilidades

`src/rules/habilidades.js` contém 12 templates que cobrem ofensiva, defensiva, mobilidade, controle, suporte, utilitária e suprema. Cada template informa potência, custo, alcance, área, duração, recarga, condições, contrajogo, nível mínimo e versão de regras.

As distâncias são em metros; duração e recarga são em turnos. O custo usa `arredondar(8 + 0,35 × PP)`. Os custos exatos de alcance, área, duração e os limites por nível são decisões de protótipo baseadas nas faixas do documento do grupo. A versão atual é `0.1.0`; isso não representa balanceamento definitivo.

O personagem começa no nível 1, com 100 de vida, 100 de energia e duas habilidades. Atributos começam em 10, recebem os bônus da classe, e esses bônus precisam estar entre -2 e +4, com até +6 na soma dos positivos. Origem tem função narrativa nesta versão. A suprema está bloqueada até o nível 6.

`aplicarApresentacao()` permite adaptar nome, descrição e visual, rejeitando campos mecânicos. O validador de habilidades rejeita excesso de orçamento e combinações incompatíveis com os limites implementados.

## Conferir o que será enviado à IA sem gastar créditos

```powershell
npm run contexto
```

Selecione uma ficha criada no passo anterior. O comando salva `instrucao_sistema` e `contexto` em `output/contextos`, sem consultar OpenRouter ou Gemini. Também aceita o caminho de uma ficha:

```powershell
npm run contexto -- "C:\caminho\personagem.json"
```

O contexto contém o tema e o tom, resumo da campanha, ficha oficial, habilidades e seus números, cena atual, NPCs presentes, últimos resultados e resultado da ação que precisa ser narrada. Campos são selecionados explicitamente; chaves de API, segredos e dados de outros mundos não são copiados.

## Narrar no terminal

```powershell
npm run jogar
```

Essa etapa usa a chave já configurada no `.env`, somente quando há uma narração nova para solicitar. `NARRATION_MAX_TOKENS` limita a resposta e tem padrão de 900, independente de `WORLD_MAX_TOKENS`.

| Comando | Comportamento |
| --- | --- |
| `/ficha` | Consulta local da ficha oficial. |
| `/habilidades` | Mostra poderes, custos e limitações. |
| `/locais` | Mostra o local atual e conexões conhecidas. |
| `/observar` | Solicita uma narração do cenário conhecido. |
| `/falar texto` | Solicita diálogo com NPCs presentes. |
| `/teste forca abrir a porta` | Node.js rola D20, soma o modificador e compara com dificuldade 12. |
| `/ir 1` | Node.js valida e registra a mudança para a conexão número 1. |
| `/contexto` | Exporta o contexto sem chamada de API. |
| `/repetir` | Reutiliza o último resultado, sem rolar dados ou aplicar mudanças novamente. |
| `/ajuda` | Lista os comandos. |
| `/sair` | Encerra a sessão. |

Os nomes de atributos dos testes são `forca`, `destreza`, `inteligencia`, `carisma`, `constituicao` e `sabedoria`. A dificuldade fixa 12 é uma regra de protótipo; não vem da IA. O resultado do teste não concede itens, cura ou alterações de cenário adicionais. Ações em texto livre são intenções; o Mestre deve pedir esclarecimento quando faltarem regras para resolvê-las.

Antes de consultar a IA, o programa salva o resultado oficial em `output/partidas`. Uma falha de API preserva esse resultado. `/repetir` usa o mesmo ID e o mesmo D20. Se já existir uma narração válida, ela é reutilizada sem outra consulta. Ao reabrir a mesma ficha, a partida é retomada se mundo, regras e ficha forem compatíveis.

## Limites criativos e contrato de resposta

O prompt fixo em `src/prompts/mestrePrompt.js` aplica os limites do PDF do grupo: autoridade do Node.js sobre números e mapas, autonomia dos jogadores, cooperação, continuidade, conteúdo escolar, imagens ilustrativas e mensagens de jogadores tratadas como dados.

A resposta da IA pode conter somente:

```json
{
  "resultado_id": "ID do resultado oficial",
  "personagem_id": "ID do personagem",
  "ambiente_id": "ID da cena atual",
  "narracao": "Texto da narração",
  "propostas": []
}
```

Propostas permitem somente `tipo` (`local`, `npc`, `evento` ou `missao`) e `descricao`. Nunca são executadas automaticamente. Campos como vida, dano, inventário ou comandos são rejeitados, assim como IDs de outra cena ou personagem. A narração aparece depois do resumo oficial calculado pelo código.

Esse contrato impede que a resposta atualize os números ou o mapa. A coerência semântica de toda frase não pode ser garantida só por um prompt: uma narração contraditória exige revisão e uma nova tentativa. O estado oficial continua independente do texto.

A geração inicial do mundo também recebe os limites criativos e a instrução de que habilidades de classe no JSON são narrativas; os números da ficha vêm do catálogo.

## Escopo para a integração seguinte

Não há interface visual, conexão ao banco ou implementação completa de combate multiplayer nesta entrega. Dano em alvos, efeitos persistentes, uso de habilidade em combate, progressão e autorização por jogador devem ser conectados ao motor de regras da equipe. O fluxo não atribui esses poderes à IA enquanto essas regras não existirem.

Fontes do grupo: `Limites_Criativos_Para_IA.pdf` e `Documento_Sistema_Balanceado_de_Habilidades.docx`. Os arquivos originais não foram alterados.

## Verificação

```powershell
npm test
```

Os testes usam entrada real de terminal em memória, arquivos temporários e respostas simuladas de OpenRouter/Gemini. Verificam escolha e revisão de ficha, cancelamento, limites, adulteração, contexto, campos proibidos, IDs, propostas pendentes e repetição sem recalcular resultados. Não gastam créditos de API.
