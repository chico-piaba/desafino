# Design — Monitoramento e log de eventos do DESAFINO

Data: 2026-07-25 · Status: aprovado pelo usuário

## Objetivo

Dar visibilidade de quem está usando o jogo durante os testes: quais salas existem,
quem está em cada uma, e um registro cronológico de tudo que acontece (eventos do
jogo e ciclo de conexão dos sockets). Visualização por painel web ao vivo e por
arquivo de log.

Fora do escopo (YAGNI): log de acessos HTTP, rotação de log, gráficos/histórico,
métricas agregadas.

## Componentes

### 1. Registrador de eventos — `src/eventos.js`

Módulo puro, testável isolado do servidor.

```js
const registrador = criarRegistrador({ arquivo, limiteMemoria = 300 });
registrador.registrar(tipo, dados);   // dados: objeto plano, ex. { sala, nome, pontos }
registrador.recentes();               // array dos últimos N eventos (memória)
registrador.aoRegistrar(fn);          // assinatura p/ feed ao vivo (fn(evento))
```

- Cada evento vira **uma linha JSONL** em `arquivo`: `{"ts":"<ISO>","tipo":"...", ...dados}`.
  Escrita com `fs.appendFile` (fire-and-forget; erro de disco só gera `console.error`,
  nunca derruba o jogo).
- `arquivo` padrão em produção: `data/eventos.jsonl` — proposital: no Docker o
  diretório `data/` já é o volume nomeado `dados`, então o log sobrevive a updates.
  Localmente, `data/eventos.jsonl` entra no `.gitignore`.
- Ring buffer em memória com os últimos `limiteMemoria` eventos para servir o
  snapshot do painel sem ler o arquivo.
- `arquivo: null` desliga a escrita (usado nos testes de integração do servidor).

### 2. Instrumentação — `src/server.js`

`criarServidor` ganha opção `registrador` (padrão: um registrador real). Tipos de
evento registrados:

| Tipo | Dados principais |
|---|---|
| `salaCriada` / `salaExpirada` / `salaReiniciada` | sala |
| `jogadorEntrou` / `jogadorReconectou` | sala, num, nome, dupla |
| `jogadorRemovido` | sala, num, nome |
| `socketConectado` / `socketDesconectado` | socketId; sala/num/nome quando identificado |
| `partidaIniciada` | sala, modoJogo, jogadores (nomes) |
| `rodadaComecou` | sala, rodada, apresentador, adivinhador, modo |
| `mudouParaMimica` | sala, rodada |
| `dicaComprada` | sala, rodada, tipo, custo |
| `acertou` | sala, rodada, musica, pontos (+bonusApresentador no x1) |
| `passou` / `tempoEsgotado` | sala, rodada, musica |
| `fimDeJogo` | sala, placar (duplas ou pontosJogadores) |

### 3. Painel — `public/monitor/`

Página estática no design neo-retrô, mesmas fontes/estilo das demais.

- **Topo**: contadores — salas ativas, jogadores conectados, eventos registrados.
- **Coluna Salas**: card por sala com código, fase (lobby/rodada N/fim), modo
  (duplas/x1) e a lista de jogadores com indicador 🟢/🔴 de conexão.
- **Coluna Feed**: eventos em tempo real (mais novo no topo), com hora, tipo
  legível em pt-BR e detalhes; carrega os recentes do snapshot e vai empilhando.
- Fluxo: página lê `?token=` da URL → `GET /api/monitor?token=...` (snapshot:
  `{salas, eventos}`) → conecta Socket.IO e emite `monitorar(token)`; servidor
  valida e coloca o socket na room `monitor`; a cada evento registrado o servidor
  emite `monitorEvento` para essa room; mudanças de estado das salas emitem
  `monitorSalas` (snapshot leve).
- Nomes de jogadores sempre via `esc()` (mesmo padrão anti-XSS das outras telas).

### 4. Proteção por token

- Token vem de `process.env.MONITOR_TOKEN`; se ausente, o servidor gera um
  aleatório (`crypto.randomBytes`) no boot e imprime
  `Monitor: /monitor/?token=XXXX` no stdout (visível em `~/Library/Logs/desafino.log`).
- `GET /api/monitor` sem token válido → **403** com mensagem pt-BR.
- `monitorar` com token inválido → evento `erro` e socket fora da room.
- A página `/monitor/` em si é estática (sem dados); só o snapshot e o socket
  exigem token.
- Infra: fixar `MONITOR_TOKEN` no plist do launchd (EnvironmentVariables) e
  documentar no README a linha `environment:` do docker-compose.

### 5. Testes

- `test/eventos.test.js`: linha JSONL correta (ts ISO + campos), ring buffer
  respeita o limite, `aoRegistrar` notifica, `arquivo: null` não escreve.
- `test/server.test.js` (novos casos): fluxo de partida gera a sequência esperada
  de tipos de evento; `/api/monitor` sem/with token errado → 403; com token certo →
  snapshot com a sala e jogadores; socket `monitorar` recebe `monitorEvento` ao
  vivo quando alguém entra numa sala.

## Decisões

- Log no volume `data/` (persistência no Docker) em vez de `logs/` novo.
- Token por env var, não em `config.json` (o repo é público).
- Painel recebe eventos apenas do momento da conexão em diante + os `limiteMemoria`
  recentes; histórico completo é papel do arquivo JSONL (`tail -f`, `jq`).
