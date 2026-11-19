# Protocolo da partida

As requisições HTTP usam JSON. Após o login, o navegador envia o cookie de sessão automaticamente. O servidor associa a ação ao personagem do usuário autenticado e verifica seu vínculo com a sala.

## Rotas HTTP

| Método e rota | Operação |
| --- | --- |
| `POST /api/autenticacao/cadastro` | Cria a conta com `username`, `email` e `senha`. |
| `POST /api/autenticacao/login` | Autentica `login` e `senha` e cria a sessão. |
| `POST /api/autenticacao/logout` | Revoga a sessão e desconecta seus sockets. |
| `GET /api/salas` | Lista as salas do usuário. |
| `POST /api/salas` | Cria sala com `titulo`, `historia` e `tom`. |
| `POST /api/salas/entrar` | Entra na preparação pelo `codigo`. |
| `GET /api/salas/:id` | Retorna sala e snapshot da campanha. |
| `GET /api/salas/:id/catalogo` | Retorna classes, origens, habilidades e retratos. |
| `POST /api/salas/:id/avatar/previa` | Sugere retrato por `classe_id`, `descricao_visual` e `raca_id` opcional. |
| `POST /api/salas/:id/personagem` | Salva nome, classe, origem, descrição, habilidades e avatar da ficha. |
| `POST /api/salas/:id/pronto` | Atualiza `pronto` durante a preparação. |
| `POST /api/salas/:id/iniciar` | Inicia a partida por solicitação do anfitrião. |
| `GET /api/salas/:id/historico` | Página do diário com `limite` e `deslocamento`. |
| `POST /api/salas/:id/encerrar` | Encerra a sala por solicitação do anfitrião. |

## Eventos Socket.IO

| Evento do cliente | Campos | Resultado |
| --- | --- | --- |
| `sala:acompanhar` | `sala_id` | Entra no canal autorizado e recebe o snapshot. |
| `sala:parar` | `sala_id` | Sai do canal. |
| `sala:pronto` | `sala_id`, `pronto` | Atualiza a prontidão. |
| `sala:iniciar` | `sala_id` | Inicia a aventura. |
| `sala:acao` | `sala_id`, `acao`, `turno_esperado`, `acao_id` | Resolve a ação e retorna a campanha. |
| `sala:repetir` | `sala_id`, `pedido_id` | Retoma a narração da cena pendente do autor. |
| `sala:descartar` | `sala_id`, `pedido_id` | Descarta a cena pendente do autor quando ainda não houve resolução mecânica. |

O navegador gera `acao_id` no formato `acao_` seguido de 32 caracteres hexadecimais. Clientes antigos podem omiti-lo. Quando presente, o mesmo identificador só aceita o mesmo autor, turno e texto. O reconhecimento persiste após reiniciar o servidor.

O acknowledgement contém `ok: true` e o resultado ou `ok: false` e `erro`, com `codigo`, `status` e `mensagem`. O servidor publica `sala:atualizada` para mudanças do lobby e `campanha:atualizada` para o estado da aventura. `sessao:encerrada` informa expiração ou revogação.

Durante a geração, `campanha:narracao` transmite `sala_id`, `campanha_id`, `cena_id` e o `texto` acumulado da narração. A interface apresenta esses trechos enquanto a resposta completa é validada. Em caso de falha, o evento recebe `erro: true` e a interface oferece a recuperação da cena pendente. A publicação definitiva continua sendo feita por `campanha:atualizada`.

As cenas podem incluir até três `escolhas`, cada uma com `rotulo` e `acao`. Elas são persistidas no diário e reapresentadas ao reconectar. O jogador seleciona uma opção e pode complementar diálogos e investigações. A abertura e cenas antigas recebem opções locais com base nos NPCs e conexões disponíveis. Os resultados mecânicos continuam sendo validados ao executar cada ação.

## Falhas e recuperação

| Situação | Resposta |
| --- | --- |
| Sessão inválida | HTTP 401 ou erro no socket, seguido de nova autenticação. |
| Turno antigo | HTTP 409 / `TURNO_DESATUALIZADO`. O cliente consulta o estado atual. |
| Cena pendente | HTTP 409 / `CENA_PENDENTE`. O autor pode retomar a narração. |
| Limite do provedor | HTTP 429 / `LIMITE_IA`. A interface informa o limite e mantém a cena salva. |
| Falha de narração | HTTP 502. A cena continua pendente para recuperação. |
| Confirmação perdida | O cliente recupera snapshot e diário antes de permitir nova ação. |

Os endpoints HTTP `/acoes`, `/repetir` e `/descartar` sob `/api/salas/:id` permanecem disponíveis e usam os mesmos serviços do WebSocket.
