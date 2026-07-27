1# Design — Controle da sala, configuração e juízo coletivo

Data: 2026-07-26 · Status: aprovado

## Contexto

Este é o **sub-projeto C** de uma expansão maior do Hum-a-Tune, decomposta em quatro
specs independentes:

| # | Sub-projeto | Situação |
|---|---|---|
| **C** | Controle da sala, configuração e juízo coletivo | **este documento** |
| **A** | Baralhos e bibliotecas (tags, pacotes curados, deck de filmes) | próximo |
| **B** | Dicas 2.0 (forca legível, língua, dicas por tipo de baralho) | depende de A |
| **D** | Modos de jogo (solo e derivados) | depende de A |

C vem primeiro porque não toca no modelo de dados das músicas — logo não conflita
com A — e entrega melhoria jogável imediata.

**Decisões de A já tomadas** (para o spec seguinte, não implementar aqui): tags na
carta em vez de arquivos separados; um baralho por partida; pacotes fixos curados
a dois; primeiro deck de filmes = "Oscar — vencedores e indicados, todos os períodos".

## Objetivo

Tirar o controle da TV e colocá-lo no celular do líder, deixar a sala configurável
por partida, dar ao apresentador uma saída quando não conhece a música, e resolver
o furo do "apresentador esqueceu de confirmar o acerto" com juízo da plateia — que
ganha, junto, uma forma de participar da rodada em que não está jogando.

## 1. Líder: a autoridade sai da TV

Hoje a autoridade é o display, via `donoToken` e `exigirDono()` (`src/server.js:365`).

- `sala.liderId` guarda o id do **primeiro jogador que entra** na sala.
- **Sucessão automática:** quando o líder desconecta ou é removido, assume o jogador
  conectado mais antigo (menor `num`). Sem ninguém conectado, `liderId` fica nulo e o
  próximo a entrar assume. **A liderança não volta** para quem caiu — sem disputa.
- `exigirDono()` vira `exigirLider()`: exige `socket.data.playerId === sala.liderId`.
- Migram para o líder: `iniciarPartida`, `removerJogador`, `reiniciarSala`, e o novo
  `configurarSala`.
- O líder **não pode se auto-expulsar** (erro explícito) — senão a sucessão dispara
  no meio da própria ação.
- `estadoPublico` ganha `liderNum`; o estado privado ganha `ehLider`.

**O `donoToken` não morre:** deixa de dar poderes e passa a ser só a identidade da
TV, para que um F5 no display reencontre a mesma sala em vez de criar outra.

**A TV** mostra código, QR, lobby, placar, rodada, votação e resultado. Zero botões.

**Consequência aceita:** `reiniciarSala` devolve todos os celulares ao formulário de
entrada, então o primeiro a reentrar vira o novo líder. É a mesma regra geral
("líder = primeiro a entrar"), sem exceção — não é um caso especial a tratar.

## 2. Configuração por sala

`config.json` deixa de ser injetado direto no jogo e passa a ser **default**. Cada
sala carrega sua `sala.config` (cópia dos defaults + overrides do líder), e o jogo
recebe essa cópia.

**Refactor obrigatório:** `iniciarTimer`, `registrarFimSeAcabou` e `estadoPublico`
leem hoje o `config` do closure de `criarServidor`. Passam a ler `sala.jogo.config`.

Knobs do líder, **só no lobby**:

| Knob | Faixa | Default |
|---|---|---|
| `duracaoSegundos` | 30–180 (passo 15) | 90 |
| `totalRodadas` | 4–20 | 8 |
| `maxDuplas` | 1–10 | 4 |
| `trocaMusica` | on/off | on |
| `trocaCusto` | 0–50 | 20 |
| `palpitePlateia` | on/off | on |
| `rouboFracao` | 0–0.20 | 0.05 |
| `votacaoPlateia` | on/off | on |

- **Teto de 20 pessoas na sala** (`maxJogadores`), validado à parte do número de
  duplas. Hoje só existe entrada com dupla, mas o teto fica explícito para não virar
  buraco quando A/D trouxerem outros papéis.
- `entrarJogador` hoje aceita só as duplas 1–4 (`src/game.js:37`, lista literal).
  Passa a validar contra `jogo.config.sala.maxDuplas`.
- Fora da tabela de knobs, mas em `config.json` e ajustáveis por arquivo:
  `plateia.bonusFracao` (0.5), `plateia.votacaoSegundos` (10) e
  `plateia.palpiteIntervaloMs` (2000). Não vão para a tela do líder — são
  balanceamento fino, não decisão de mesa.
- Validação em `src/configSala.js`: **satura** valores fora de faixa em vez de
  estourar, rejeita knob desconhecido, e faz merge sobre os defaults — um
  `config.json` antigo continua funcionando.
- **Persistência:** `reiniciarSala` preserva `sala.config`. A próxima partida na
  mesma sala mantém o ajuste do líder. Nada é guardado no celular — YAGNI.

## 3. Trocar música

- `game.trocarMusica(jogo, jogadorId)` — só o apresentador, só em `emAndamento`,
  **1 por rodada** (`r.trocasUsadas`), e só se o knob estiver ligado.
- **O pote é único e nunca reseta.** Ao trocar, o gasto acumulado em dicas vira uma
  linha de ação `{tipo: 'dicasAnteriores', custo: X}` e `r.dicasCompradas` zera para
  a música nova. O adivinhador pode recomprar dicas da música nova, pagando de novo;
  nada do gasto anterior é devolvido.
- **O cronômetro continua correndo** — trocar não pode virar jeito de ganhar tempo.
- A música descartada entra em `musicasUsadas`: não volta na partida.
- Evento `musicaTrocada` no monitor.

## 4. O pote

Fórmula única, usada por todos os caminhos de acerto:

```
valorAtual = max(0, config.modos[r.modo] − Σ dicas.custo − Σ acoes.custo − Σ roubos.valor)
```

`acoes` cobre troca de música e o carry-over `dicasAnteriores`. `roubos` guarda o
**valor já calculado** de cada roubo da plateia (não a fração) — assim o pote
continua sendo uma subtração pura e o histórico é auditável.

## 5. Confirmar o acerto

Três caminhos para a rodada terminar com pontos:

1. **Apresentador aperta "Acertou!"** — como hoje, resolve na hora.
2. **Adivinhador aperta "Eu acertei!"** — abre a votação da plateia.
3. **Tempo esgota** — antes de cravar 0, abre a votação "a dupla acertou?".

**Todos os três pagam `valorAtual`** — o pote descontado até aquele instante, com
dicas, ações e roubos já abatidos. Não existe acerto que pague o pote cheio.

### A votação

Fase nova da rodada: `r.fase = 'votacao'`, com `r.votacao = { origem, eleitores, votos }`.

- **Eleitores** são fixados na abertura: jogadores conectados que não são o
  apresentador nem o adivinhador.
- **Quórum:** mais de 50% dos eleitores votando "acertou".
- **Resolve** quando o quórum é atingido, quando todos votaram, ou aos 10s.
- Falhou: origem `tempo` → 0 pontos; origem `adivinhador` → volta a `emAndamento`.
- **O cronômetro pausa durante a votação** e retoma se ela falhar. O servidor ganha
  `retomarTimer(sala)`, que reaproveita `sala.tempoRestante`.
- O apresentador pode apertar "Acertou!" durante a votação e resolver na hora. Ele
  **não veta** o resultado da plateia — maioria disse que acertou, acertou.
- **Sala de uma dupla (x1) não tem plateia, logo não tem votação.** "Eu acertei!"
  vira só um alerta na tela do apresentador; tempo esgotado crava 0 como hoje.
  Vale o mesmo quando o knob `votacaoPlateia` está desligado.

## 6. Palpite e roubo da plateia

Quem está na plateia digita palpites no celular durante a rodada.

- Válido só em `emAndamento`, só para a plateia, só com o knob ligado, só no modo
  duplas (x1 não tem plateia).
- **Roubo percentual:** um palpite certo tira
  `max(1, round(valorAtual × config.plateia.rouboFracao))` do pote — 5% por padrão.
  Percentual nunca zera a rodada por construção.
- **A dupla de quem acertou ganha `round(valor × 0.5)`**, somado na hora em
  `jogo.duplas[n].pontos` — sem prêmio, ninguém se arrisca e a mecânica morre.
- **Um roubo por dupla por rodada**, rastreado em `r.duplasQueRoubaram`. O segundo
  acerto da mesma dupla não tira nem paga nada; o jogador recebe "sua dupla já
  roubou nesta rodada". Com o teto de 10 duplas, o dano máximo ao pote é ~37%.
- Rate limit de 1 palpite a cada 2s por jogador, aplicado também a palpites errados.
- **Palpites são privados.** Errado volta só para quem enviou. Certo é anunciado no
  display **sem o título** ("🔥 Ana roubou 5 pts!"). Se o texto vazasse para a sala,
  a plateia viraria canal para soprar a resposta ao adivinhador.

### Tolerância na comparação (`src/texto.js`)

Normaliza, nesta ordem: caixa; acentos (NFD + remoção de diacríticos); trechos entre
parênteses; pontuação; artigos iniciais (`O`, `A`, `Os`, `As`, `The`); espaços
repetidos. Depois compara por distância de Levenshtein com limiar
`min(3, floor(tamanho / 8) + 1)`.

Na prática "EVIDÊNCIAS!!", "evidencias" e "evidencas" passam; "evidente" não.

## 7. Interface

- **Display:** perde os botões; ganha "👑 Líder: Fulano", painel de votação com
  contagem ao vivo, e o aviso de roubo sem título.
- **Celular do líder:** coroa, tela de configuração no lobby, botões iniciar /
  expulsar / reiniciar.
- **Apresentador:** "🔀 Trocar música (−20 · 1 por rodada)".
- **Adivinhador:** "✋ Eu acertei!".
- **Plateia:** campo de palpite durante a rodada; "Acertou / Não acertou" na votação.

## 8. Arquivos

`src/game.js` está em 269 linhas e esta mudança o dobraria. Divisão feita junto:

| Arquivo | Papel |
|---|---|
| `src/texto.js` (novo) | normalização e comparação tolerante |
| `src/dicas.js` (extraído) | `gerarForca`, `conteudoDica`, `primeiraLetra` — porta de entrada do sub-projeto B |
| `src/configSala.js` (novo) | defaults, merge e saturação dos knobs |
| `src/game.js` | motor: líder, troca, votação, roubo |

`config.json` ganha as chaves `sala`, `troca` e `plateia`; `configSala.js` faz merge
com os defaults, então um `config.json` sem elas continua válido.

Novos eventos no monitor: `liderDefinido`, `salaConfigurada`, `musicaTrocada`,
`votacaoAberta`, `votacaoResolvida`, `plateiaRoubou`.

## 9. Testes

- **`texto.test.js`** — acento, pontuação, artigo inicial, parênteses, limiar de
  digitação por tamanho, e um falso positivo que deve ser rejeitado.
- **`configSala.test.js`** — saturação acima e abaixo da faixa, knob desconhecido,
  merge sobre `config.json` sem as chaves novas.
- **`game.test.js`** — troca (limite por rodada, custo, pote não reseta, música não
  volta); votação (quórum, empate reprovado, sem plateia, timeout, apresentador
  resolve antes); roubo (percentual, piso de 1, um por dupla, bônus, inativo em x1);
  líder (sucessão por desconexão, não pode se auto-expulsar).
- **`server.test.js`** — via sockets: líder configura e o display **não** consegue
  iniciar partida; sucessão ao desconectar; rate limit do palpite; pausa e retomada
  do cronômetro na votação.

## 10. Riscos

1. A votação adiciona uma fase à rodada, e **todo caminho de fim precisa passar por
   ela sem vazar timer**. É onde a implementação tem mais chance de errar; os testes
   de pausa/retomada existem por causa disso.
2. A migração de `config` global para `config` por sala toca pontos espalhados no
   `server.js`. Um uso esquecido do closure produz sala configurada que não respeita
   a própria configuração — silencioso, não estoura.
3. A 5%, o roubo é tempero, não ameaça. Se ficar fraco na mesa, o ajuste é o knob
   `rouboFracao`, não código novo.
