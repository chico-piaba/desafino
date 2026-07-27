# Design — Modo todos contra todos

Data: 2026-07-27 · Status: aprovado

## Contexto

Sub-projeto **D** da expansão. Independente de A3 (baralhos) e A4 (aposta); pode ser
implementado em paralelo, porque não toca no modelo de carta.

## O que é

Um terceiro modo de jogo, ao lado do clássico em duplas e do duelo x1. Acaba a dupla
fixa: cada jogador apresenta na sua vez e **a sala inteira tenta adivinhar**. Quem
acertar primeiro leva o pote; quem apresentou leva metade. Placar individual.

Resolve um problema real de festa: o jogo em duplas exige número par e emparelhamento
combinado. Com sete pessoas chegando em horas diferentes, montar duplas trava a noite.

## Por que é mais barato do que parece

Três peças que ele precisa **já existem**, construídas em C:

1. **Placar individual** — o duelo x1 já usa `jogo.pontosJogadores` e o display já
   sabe renderizar ranking individual.
2. **Bônus do apresentador** — o x1 já paga `config.x1.bonusApresentador` (metade)
   a quem apresenta, pela mesma razão de desenho: sem isso, quem apresenta teria
   incentivo de sabotar a própria rodada.
3. **Palpite digitado com comparação tolerante** — o roubo da plateia já recebe
   texto do celular e decide se bate com o título, com tolerância a acento,
   pontuação, artigo e erro de digitação (`src/texto.js`).

O modo novo é, em boa medida, **a mecânica de palpite da plateia promovida a
mecânica principal**, com o placar individual do x1.

## Como funciona

### Entrada e formação

- O líder escolhe o modo no lobby: `duplas` (padrão) ou `todosContraTodos`.
- Em todos contra todos, a escolha de dupla some da tela de entrada — cada um entra
  só com nome e avatar.
- Mínimo de 3 jogadores. Com 2, o duelo x1 já é o formato certo e o líder é avisado.

### A rodada

- A ordem de apresentação é a de entrada (`num`), rodando a cada rodada.
- O apresentador vê a carta e interpreta, como hoje.
- **Todos os outros** digitam palpites no celular — não existe papel de adivinhador
  nem de plateia, todo mundo é adivinhador.
- **O primeiro palpite certo encerra a rodada.** Quem acertou leva `valorAtual`;
  quem apresentou leva `round(valorAtual × config.x1.bonusApresentador)`.
- Palpite errado não penaliza; vale o mesmo intervalo mínimo entre palpites que já
  existe (`plateia.palpiteIntervaloMs`), para não virar força bruta.

### O que muda no pote

Nada. Dicas, troca de música e o piso em zero funcionam igual. **Não há roubo da
plateia neste modo** — não existe plateia, todos estão jogando, e a mecânica de
roubo perderia o sentido.

### Confirmação de acerto

O palpite digitado resolve a rodada sozinho, então a votação da plateia **não se
aplica**. O apresentador mantém o botão "Acertou!" para o caso de alguém acertar
falando em voz alta antes de digitar — nesse caso ele escolhe quem acertou numa
lista de nomes, porque o servidor precisa saber a quem creditar.

### Fim de rodada sem acerto

Tempo esgotado ou o apresentador passa: ninguém pontua, nem ele. Igual a hoje.

## Onde o código muda

| Arquivo | Mudança |
|---|---|
| `src/game.js` | `jogo.modo` ganha `'todosContraTodos'`; `iniciarPartida` respeita a escolha do líder em vez de derivar só do número de duplas; `prepararRodada` roda por jogador e não por dupla; `palpitar` passa a poder encerrar a rodada neste modo |
| `src/configSala.js` | knob `modoJogo` |
| `src/server.js` | `eleitoresDe` devolve vazio neste modo (sem votação); `palpitar` credita e encerra |
| `public/jogar/` | seletor de modo na gaveta do líder; entrada sem dupla; todos veem campo de palpite |
| `public/display/` | ranking individual (já existe para x1) |

**Risco de acoplamento:** `prepararRodada` hoje mistura duas coisas — sortear a carta
e decidir de quem é a vez. Este modo torna a segunda parte diferente. Vale separar as
duas antes de acrescentar o terceiro caso, senão a função vira um emaranhado de `if`
por modo.

## Testes

- **Motor:** rotação por jogador; primeiro palpite certo encerra e credita; segundo
  palpite certo depois de encerrada é recusado; apresentador não pode palpitar na
  própria rodada; bônus arredondado; tempo esgotado não paga ninguém; roubo e votação
  inativos no modo.
- **Servidor:** líder escolhe o modo; entrada sem dupla aceita; com menos de 3
  jogadores o modo é recusado ao iniciar; palpite certo por socket encerra a rodada
  para todos.

## Riscos

1. **Corrida entre palpites.** Dois acertos quase simultâneos: o servidor é
   single-threaded e processa em ordem de chegada, então o primeiro a chegar ganha —
   mas isso significa que a latência de rede decide um empate. Aceitável para jogo de
   festa; registrar no evento quem acertou e em que instante permite auditar se
   alguém reclamar.
2. **Quem apresenta com muita gente esperando.** Com 8 jogadores, cada um apresenta
   uma vez a cada 8 rodadas. Se o padrão de 8 rodadas continuar, metade da mesa nunca
   apresenta. O número de rodadas deveria escalar com o número de jogadores, ou o
   líder ser avisado disso ao escolher o modo.
