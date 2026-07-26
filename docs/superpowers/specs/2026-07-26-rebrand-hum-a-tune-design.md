# Design — Rebrand DESAFINO → Hum-a-Tune (+ lobby com música, sem ranking)

Data: 2026-07-26 · Status: aprovado (escopo "tudo, incluindo infra" escolhido pelo usuário)

## Objetivo

Abolir o nome DESAFINO. O jogo passa a se chamar **Hum-a-Tune**, com logo SVG própria.
De quebra: o ranking sai da tela inicial (lobby) do display e o lobby ganha música
de fundo (chiptune gerado no navegador — offline, sem direitos autorais).

## 1. Identidade

- `public/shared/logo.js` — injeta o wordmark SVG (nota musical cantarolando com
  ondas sonoras + texto "Hum-a-Tune") nos headers das 4 páginas; usa a paleta
  neo-retrô (`#f9c629`, `#fe7ef0`, `#3adfff`, contorno `#3c2f2f`, sombra dura).
- `public/shared/icone.svg` — só o símbolo (nota com carinha), usado como favicon
  das 4 páginas (`<link rel="icon">`). Sem texto → não depende de fonte.
- Todos os textos visíveis: títulos `<title>`, h1, README, console do servidor,
  `package.json` (name `hum-a-tune`, description).

## 2. Infra (escolha explícita: renomear tudo)

- **Repo GitHub**: `chico-piaba/desafino` → `chico-piaba/hum-a-tune`
  (`gh repo rename` — o GitHub redireciona URLs antigas; imagem Docker segue
  `ghcr.io/${{ github.repository }}` e muda junto).
- **Branch**: `desafino-prototipo` → `hum-a-tune-prototipo` (atualizar triggers
  dos workflows ANTES do push; apagar branch antiga no remoto).
- **docker-compose.yml / README**: imagem e URLs novas.
- **launchd**: novo `com.humatune.server.plist` (mesmo MONITOR_TOKEN, log
  `~/Library/Logs/humatune.log`); descarregar e apagar o antigo. ⚠️ Troca reinicia
  o servidor: só executar com zero jogadores conectados (checar `/api/monitor`).
- **localStorage**: chaves `desafino*` → `humatune*` com MIGRAÇÃO (na carga, se a
  chave antiga existir e a nova não, copia e apaga a antiga — ninguém perde perfil,
  sala ou sugestões pendentes).
- Tailscale (nome da máquina) não muda.

## 3. Display: lobby sem ranking, com música

- O `<aside>` do ranking fica oculto na fase `lobby` (não faz sentido antes do jogo).
  O botão "↺ Reiniciar sala" migra do aside para o header (visível sempre).
- `public/shared/chiptune.js` — loop 8-bit em WebAudio (melodia quadrada +
  baixo triângulo + chimbal de ruído, ~112 BPM, ganho baixo), API
  `criar()` → `{ligar(), desligar(), ligado()}`.
- Botão 🔊/🔇 no header do display; navegador exige gesto pra áudio, então começa
  desligado e o clique liga. Preferência persiste em `humatuneSomLobby`.
  A música toca APENAS na fase `lobby` (para sozinha quando a partida começa e
  volta quando a sala reinicia, se o som estiver ligado).

## Fora do escopo

Rebrand de documentos históricos (specs/planos antigos citam DESAFINO como registro);
mudança do nome da pasta local `HUM-A-TUNE` (já é o nome novo).

## Testes

Suíte atual precisa continuar verde (nada de lógica de jogo muda). Verificação
manual: favicon + logo nas 4 páginas, música liga/desliga e cala fora do lobby,
migração de localStorage (perfil antigo continua valendo), repo/imagem novos no CI.
