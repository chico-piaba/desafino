# Hum-a-Tune 🎤🎭

Jogo de festa em duplas: um cantarola (ou faz mímica do título), o parceiro adivinha a música.
Protótipo local — o servidor roda no seu notebook e os celulares entram por QR code na mesma rede Wi-Fi.

## Como jogar

1. `npm install && npm start`
2. Abra o **display** (`http://localhost:3000/display/`) numa TV ou telão — ele cria uma
   **sala com código de 4 letras** e daí em diante é só telão: quem manda é o celular.
3. Cada jogador escaneia o QR code (ou digita o código) e entra com nome + dupla.
   **O primeiro a entrar vira o líder** 👑: é ele quem configura a sala (duração, número
   de rodadas, até 10 duplas, troca de música, palpite e votação da plateia), expulsa
   jogador e começa a partida. Se o líder cair, o jogador conectado mais antigo assume.
4. Na sua vez, o apresentador vê a música no celular (privado!) e cantarola — vale **100 pts**.
   Pode **mudar para mímica** (o valor cai para 70) ou **trocar a música** (−20 pts, uma vez
   por rodada; o relógio não para e nada do que já foi gasto volta).
5. O adivinhador fala os palpites em voz alta e pode **comprar dicas** no celular:
   década −5, cantor −10, ano −10, gênero −10, inicial do título −15 e a **forca** −25.
6. **A plateia participa:** quem não está na rodada pode digitar palpites. Acertou o título?
   Rouba 5% do pote e a dupla dele leva metade — mas **cada dupla só rouba uma vez por rodada**.
7. **Confirmar o acerto** tem três caminhos: o apresentador aperta "Acertou!", o adivinhador
   aperta "✋ Eu acertei!" (abre votação da plateia), ou o tempo acaba (também abre votação).
   Mais de 50% da plateia confirmando fecha o acerto pelo valor que restou no pote.
   Numa sala de uma dupla só (duelo x1) não há plateia, então o apresentador decide sozinho.
8. São 8 rodadas por padrão. Vence a dupla com mais pontos.

**Modo x1 (duelo):** com apenas uma dupla na sala, a partida vira um contra o outro —
os papéis alternam a cada rodada, o adivinhador leva os pontos da rodada e o
apresentador ganha metade no acerto (para ninguém sabotar a própria apresentação).
Vence quem somar mais pontos individuais.

## Balanceamento

Os padrões ficam em `config.json` (duração, nº de rodadas, valores dos modos, preço das
dicas, limites da sala, custo da troca e regras da plateia). O líder ajusta a maior parte
disso na própria sala, pelo celular, sem reiniciar o servidor — e o ajuste sobrevive ao
"reiniciar sala". `bonusFracao`, `votacaoSegundos` e `palpiteIntervaloMs` só mudam no arquivo.

## Banco de músicas

`data/musicas.json` traz **500+ músicas** (nacionais e internacionais, com ano e gênero),
geradas por `node scripts/gerar-banco.js` a partir da iTunes Search API — rode de novo para
expandir sem perder o que você adicionou. Gerencie em `http://localhost:3000/admin/`, com
busca no iTunes para preencher título/artista/ano/gênero automaticamente.

## Hospedagem numa VPS (Docker)

A cada push, o CI publica a imagem em `ghcr.io/chico-piaba/hum-a-tune:latest`. Na VPS:

```bash
mkdir hum-a-tune && cd hum-a-tune
curl -fsSLO https://raw.githubusercontent.com/chico-piaba/hum-a-tune/hum-a-tune-prototipo/docker-compose.yml
docker compose pull && docker compose up -d
```

O jogo sobe na porta 3000; o volume `dados` guarda o banco de músicas (edições do
`/admin` sobrevivem a atualizações — na primeira subida ele é semeado com as músicas
do repositório). Para atualizar: `docker compose pull && docker compose up -d`.

Para HTTPS, coloque um proxy na frente (Caddy resolve com 2 linhas de Caddyfile:
`seudominio.com { reverse_proxy localhost:3000 }` — WebSockets inclusos). O QR já
se adapta ao domínio de quem acessa.

## Monitoramento

`/monitor/?token=SEU_TOKEN` mostra ao vivo as salas ativas, quem está conectado e o
feed de eventos (entradas, rodadas, dicas, acertos). O token vem da variável de
ambiente `MONITOR_TOKEN`; sem ela, o servidor gera um aleatório e imprime no log
na subida. Todos os eventos também ficam em `data/eventos.jsonl` (uma linha JSON
por evento — `tail -f` ou `jq` para acompanhar), que no Docker vive no volume `dados`.

## Testes

`npm test` — motor do jogo, banco de músicas, interpretação do iTunes e integração via sockets.
