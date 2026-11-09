# Entre Mundos — RPG cooperativo

Interface web responsiva em HTML, CSS e JavaScript, com Express, SQLite e Socket.IO. O servidor controla fichas, dados e combate; o serviço de IA narra a campanha.

## Executar

Requer Node.js 24 ou superior.

```sh
npm install
npm start
```

Abra http://127.0.0.1:3000. A porta pode ser configurada em `PORT` no `.env`. O servidor escuta apenas no computador local; para testar dois jogadores, use dois navegadores ou um perfil normal e um privado. Abas do mesmo perfil compartilham o login.

Para narração real, configure um provedor no `.env`, usando `.env.example` como referência. Não sobrescreva um `.env` já configurado. Ao escolher Gemini direto, deixe a chave de OpenRouter vazia; quando ambas existem, OpenRouter tem prioridade. A chave fica exclusivamente no servidor. Sem IA disponível, a criação pode usar a base local, mas as ações narradas precisam de um provedor funcional.

O modo anterior de terminal continua disponível:

```sh
npm run terminal
```

## Jogar

1. Cadastre uma conta e faça login.
2. Crie uma aventura com nome, universo e tom, ou entre com o código de 16 caracteres.
3. Escolha classe, origem quando disponível, duas habilidades e avatar. Descreva a aparência e salve a ficha.
4. Cada participante confirma que está pronto. O anfitrião inicia quando houver de 2 a 8 jogadores prontos.
5. Envie ações pelo diário. Os botões de destino movem o grupo para locais conectados. Fichas, cenário, histórico e resultados são sincronizados.
6. Após falha da IA, o autor pode tentar novamente a cena pendente. Uma rolagem já realizada é preservada. Ações com resultado mecânico não podem ser descartadas.

A sessão usa cookie HTTP-only. Ao recarregar a página, a interface recupera a sessão e a última sala daquele usuário. Ao perder a conexão, novas ações ficam bloqueadas até recuperar o estado do grupo.

Alguns comandos disponíveis: `/observar`, `/falar texto`, `/teste inteligencia descrição`, `/atacar alvo`, `/defender`, `/usar habilidade alvo`. As regras e os alvos válidos são conferidos no servidor.

## Banco e migrações

O banco padrão é `database/rpg.db`. O schema inicial cria tabelas ausentes, e as migrações SQL/JavaScript em `database/migrations/` são registradas e aplicadas uma única vez, em transação. A migração de preparação acrescenta colunas sem apagar usuários, personagens ou salas; campanhas antigas já jogadas permanecem em andamento.

Faça uma cópia do banco antes de atualizar uma instalação com dados importantes. Não exclua o banco para aplicar as migrações.

## Imagens

Os avatares usados pela interface são os SVGs do catálogo existente. Os arquivos PNG que o grupo está preparando podem continuar sendo colocados em `public/avatares/`. A página do cenário utiliza um fundo provisório. A classificação e associação das 120 imagens são uma próxima etapa; a simples presença de um PNG não o cadastra automaticamente.

## Testes

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Para usar um Edge já instalado, em PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Os testes usam banco temporário e um narrador determinístico exclusivo de teste, sem ler chaves ou chamar provedores de IA. O servidor de teste usa a porta 3189 e não deve ser usado para jogar.

Cobertura: banco novo/antigo e reaplicação; autenticação e autorização; ficha e lobby; início pelo anfitrião; sincronização de dois clientes; turno desatualizado; transição de local; falha 429 e repetição sem nova rolagem; logout; duas sessões de navegador, recarga, reconexão e layout móvel. Capturas e rastros ficam em `test-results/` e não são versionados.

Os testes não comprovam disponibilidade, crédito ou qualidade de resposta do provedor real. Antes da apresentação, jogue uma rodada com a configuração real da equipe.
