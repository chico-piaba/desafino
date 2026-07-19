# DESAFINO 🎤🎭

Jogo de festa em duplas: um cantarola (ou faz mímica do título), o parceiro adivinha a música.
Protótipo local — o servidor roda no seu notebook e os celulares entram por QR code na mesma rede Wi-Fi.

## Como jogar

1. `npm install && npm start`
2. Abra o **display** (`http://localhost:3000/display/`) numa TV ou telão.
3. Cada jogador escaneia o QR code com o celular e entra com nome + dupla (2 a 4 duplas completas).
4. Clique em **Começar partida** no display.
5. Na sua vez, o apresentador vê a música no celular (privado!) e cantarola — vale **100 pts**.
   Pode **mudar para mímica** (o valor cai para 70) a qualquer momento; a troca não tem volta.
6. O adivinhador fala os palpites em voz alta e pode **comprar dicas** no celular:
   década −5, cantor −10, ano −10, gênero −10, inicial do título −15 e a **forca** −25
   (o esqueleto do título, letra por letra, estilo forca — comprar a inicial preenche a
   primeira letra). O que sobrar é o prêmio se o apresentador confirmar o **Acertou!**
   antes dos 90 segundos.
7. São 8 rodadas. Vence a dupla com mais pontos.

## Balanceamento

Tudo em `config.json` (duração, nº de rodadas, valores dos modos, preço das dicas).
Edite e reinicie o servidor.

## Banco de músicas

`data/musicas.json` traz **500+ músicas** (nacionais e internacionais, com ano e gênero),
geradas por `node scripts/gerar-banco.js` a partir da iTunes Search API — rode de novo para
expandir sem perder o que você adicionou. Gerencie em `http://localhost:3000/admin/`, com
busca no iTunes para preencher título/artista/ano/gênero automaticamente.

## Testes

`npm test` — motor do jogo, banco de músicas, interpretação do iTunes e integração via sockets.
