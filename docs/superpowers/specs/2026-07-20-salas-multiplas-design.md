# DESAFINO — Fase 1: Salas múltiplas

**Data:** 2026-07-20
**Status:** aprovado
**Contexto:** primeiro de quatro subprojetos (1. salas múltiplas → 2. identidade/avatar + lobby interativo → 3. responsividade → 4. hospedagem 24/7). Este spec cobre só o item 1.

## Objetivo

O servidor deixa de SER uma sala única e passa a gerenciar N salas isoladas em memória. Vários grupos jogam simultaneamente no mesmo servidor sem interferência.

## Regras

### Criação e posse

- Abrir `/display` cria uma sala nova com **código de 4 letras** (alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ` — sem I e O, que confundem com 1 e 0). O código é gerado com aleatoriedade própria (não o `rng` injetado do jogo, que é determinístico nos testes).
- O display criador recebe um **token de dono** (UUID) e o guarda em `localStorage`. Recarregar a página com o token reassume a MESMA sala; token de sala expirada gera sala nova.
- **Só o dono** pode: `iniciarPartida`, `removerJogador`, `reiniciarSala`. Outros sockets recebem erro claro.
- O display mostra o código gigante no lobby e o QR embute o código: `/jogar/?sala=FZQK`.
- Celular sem QR digita o código num campo novo da tela de entrada (uppercase automático).

### Isolamento

- Cada sala carrega seu próprio `jogo` (motor intacto — `game.js` não muda), `conectados`, timers de rodada, timeouts de limpeza de lobby e valor de `tempoRestante`.
- Sockets entram no canal Socket.IO `sala:CODIGO`; `tick` e `estado` só circulam dentro da sala.
- `estado` público ganha o campo `codigo`.
- Banco de músicas e `/admin` continuam globais. `GET /api/entrada` ganha o parâmetro `?sala=CODIGO` para montar a URL/QR.
- Evento de jogo vindo de socket sem sala → erro "Você não está numa sala".

### Ciclo de vida

- Sala com **zero conexões** (display incluso) agenda expiração em `salaExpiraMs` (default 60 min, injetável). Alguém reconectando cancela. Expirou → timers limpos, sala destruída; tentativas de entrar recebem "Sala não encontrada".
- `reiniciarSala` zera só a própria sala (jogo novo, celulares da sala desvinculados via `removido`), mantendo código e dono.

### Reconexão (por sala)

- Celular guarda `desafinoSala` + `desafinoPlayerId`; reconexão automática envia ambos. Sala inexistente ou playerId inválido → limpa storage e volta à tela de entrada.

## Testes

Suíte de integração reescrita com o fluxo de sala (display cria, jogadores entram com código) + casos novos: sala não encontrada; duas salas simultâneas sem vazamento de estado; ações de dono negadas a não-donos; display reassume sala pelo token; sala vazia expira.

## Fora de escopo

Avatares e lobby interativo (Fase 2), responsividade (Fase 3), deploy/escala horizontal (Fase 4), listagem pública de salas, espectadores extras por display.
