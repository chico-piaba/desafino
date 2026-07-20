# DESAFINO — Fase 2: Identidade, avatar e lobby interativo

**Data:** 2026-07-20
**Status:** aprovado
**Decisões do usuário:** avatar por montagem de peças (SVG neo-retro); lobby vivo com emotes.

## Identidade por aparelho

- O celular guarda um **perfil** (`desafinoPerfil` = nome + avatar) além de sala/playerId. Na próxima entrada — em qualquer sala — nome e avatar já vêm preenchidos.
- Sem senha, sem cadastro, sem servidor de contas (decisão da decomposição: login leve).

## Avatar por montagem de peças

- Modelo: `{ fundo, rosto, olhos, boca, acessorio }`, todos índices inteiros.
- Peças: 8 cores de fundo, 4 formatos de rosto, 6 olhos, 6 bocas, 7 acessórios (incluindo "nenhum") → ~8 mil combinações.
- Renderização por um módulo compartilhado `public/shared/avatar.js` (`avatarSvg(avatar)` → string SVG 100×100, traço grosso `#3c2f2f`, estética neo-retro). Usado no builder do celular, no lobby, no card da dupla e no ranking. Funciona no browser (global `DesafinoAvatar`) e no Node (para testes).
- O servidor **saneia** o avatar recebido (só as 5 chaves, inteiros 0–99); o cliente aplica módulo pelo tamanho real de cada lista de peças. Avatar ausente → avatar padrão.
- `entrarJogador` ganha o parâmetro `avatar`; o estado público expõe o avatar de cada jogador e `apresentadorNum`/`adivinhadorNum` na rodada (para o display achar os avatares da dupla da vez).
- Reconexão com perfil atualizado: entrar com playerId existente pode atualizar o avatar/nome? **Não** — reconexão pura reassume como está (simplicidade); para mudar o avatar, saia e entre de novo (ou reinicie a sala).

## Builder no celular (tela de entrada)

- Preview grande do avatar + uma linha por peça com botões ◀ ▶ para circular as opções + botão 🎲 (aleatório).
- O perfil salvo preenche o builder na visita seguinte.

## Lobby interativo no display

- Cada jogador vira um **card de personagem**: avatar SVG + nome + status 🟢/🔴 + ✕ de expulsão (mantido), agrupados por dupla.
- Animação idle: os avatares balançam suavemente (CSS `@keyframes`, delays aleatórios por card).
- **Emotes**: no celular, na tela de espera do lobby, 4 botões — 👋 😂 🔥 🎵. Emitem `emote(tipo)`; o servidor valida (jogador numa sala, no lobby, limite de 1/segundo por jogador) e retransmite `{ num, tipo }` para a sala. No display, o card do autor dá um pulinho e o emoji sobe flutuando.
- Durante a partida os emotes ficam desativados (foco na rodada).

## Fora de escopo

Contas/senha, histórico entre partidas, avatar editável durante a partida, emotes fora do lobby.
