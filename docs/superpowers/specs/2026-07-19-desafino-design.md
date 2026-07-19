# DESAFINO — Protótipo de jogo de festa

**Data:** 2026-07-19
**Status:** aprovado para planejamento de implementação

## Visão geral

DESAFINO é um jogo de festa presencial para duplas. Um jogador **apresenta** uma música secreta — cantarolando ou fazendo mímica do título — e o parceiro **adivinha** falando o palpite em voz alta. Quanto mais rápido o acerto e menos dicas compradas, mais pontos a dupla ganha.

O protótipo é um app web em rede local: um servidor Node.js roda no notebook (que também exibe a tela central numa TV/monitor) e os celulares dos jogadores entram pelo navegador escaneando um QR code, todos na mesma rede Wi-Fi. Sem instalação, sem deploy, sem build step: `npm install && npm start`.

Interface 100% em português (pt-BR).

## Regras do jogo

### Jogadores e partida

- 2 a 4 duplas por partida (4 a 8 jogadores).
- A partida tem **8 rodadas no total** (configurável). As duplas jogam em sequência circular; dentro de cada dupla, os papéis de apresentador e adivinhador alternam a cada rodada da dupla.
- Com 3 duplas, 8 rodadas ficam desiguais (3/3/2); o display avisa e recomenda ajustar `totalRodadas` no config (ex.: 9). O jogo não impede — protótipo.
- Ao final das 8 rodadas, **vence a dupla com mais pontos acumulados**. Empate termina empatado.

### Rodada

1. O sistema sorteia uma música do banco (sem repetir na mesma partida) e a envia **apenas ao celular do apresentador** (título + artista).
2. O apresentador escolhe o modo, o que define o valor inicial da rodada:
   - **Cantarolar**: 100 pontos
   - **Mímica** (do título): 150 pontos
3. Ao confirmar "Começar Rodada", o timer de **90 segundos** dispara em todas as telas.
4. O valor da rodada **decai linearmente do valor inicial até 0** ao longo dos 90s.
5. O adivinhador pode **comprar dicas** no celular a qualquer momento; o custo é descontado do valor atual da rodada:
   - Cantor: −10
   - Ano: −10
   - Quantidade de palavras do título: −25
   - A dica comprada aparece **somente no celular do adivinhador**; o display central anuncia apenas que uma dica foi comprada e o custo.
6. O palpite é falado **em voz alta**. O apresentador tem dois botões:
   - **"Acertou!"** — a dupla ganha o valor atual da rodada (nunca negativo) e a rodada encerra.
   - **"Passar"** — a rodada encerra com 0 pontos.
7. Timer zerado sem acerto = 0 pontos.
8. Entre rodadas, o display mostra o resultado (música revelada, pontos ganhos) por alguns segundos antes da próxima dupla.

### Configuração (`config.json`)

Todo número de balanceamento vive num arquivo de configuração, editável sem tocar em código:

```json
{
  "rodada": { "duracaoSegundos": 90, "totalRodadas": 8 },
  "modos": { "cantarolar": 100, "mimica": 150 },
  "dicas": { "cantor": 10, "ano": 10, "quantidadePalavras": 25 }
}
```

## Arquitetura

### Stack

- **Servidor**: Node.js + Express + Socket.IO. Estado da partida inteiro em memória (reiniciar o servidor = nova partida; aceitável para protótipo).
- **Frontend**: HTML/CSS/JS puro servido estaticamente, sem build step nem framework.
- **Dados**: `data/musicas.json` (banco de músicas) e `config.json` no disco.

### Páginas

| Rota | Dispositivo | Conteúdo |
|---|---|---|
| `/display` | Notebook/TV | QR code de entrada, lobby com botão **"Começar partida"** (acionado por quem opera o notebook), timer circular, modo da rodada, dupla da vez com papéis, valor atual da rodada, ranking das duplas, resultado da rodada. Só informação pública. |
| `/jogar` | Celular | Tela do jogador. Muda conforme o contexto: lobby (nome + dupla), apresentador (música privada, escolha de modo, Acertou!/Passar), adivinhador (valor da rodada, comprar dicas), plateia (espectador com placar). |
| `/admin` | Qualquer | Gestão do banco de músicas: listar, editar, remover, e **buscar na Wikipedia** para adicionar músicas com dicas autopreenchidas. |

### Comunicação (Socket.IO)

O servidor é a única fonte de verdade; os clientes renderizam o estado que recebem. Eventos principais:

- Cliente → servidor: `entrar` (nome, dupla), `iniciarPartida`, `escolherModo`, `comecarRodada`, `comprarDica`, `acertou`, `passar`.
- Servidor → clientes: `estado` (snapshot completo do jogo, emitido a cada mudança), `tick` (valor atual da rodada + tempo restante, 1×/segundo).
- Reconexão: o celular guarda um `playerId` em `localStorage`; ao reconectar, reassume a vaga e recebe o estado atual.

### Máquina de estados da partida

```
lobby → rodada:escolhendoModo → rodada:emAndamento → rodada:resultado → (próxima rodada | fim)
```

O motor do jogo (sorteio, rotação de duplas, decaimento, dicas, placar) é um módulo puro (`src/game.js`), sem dependência de Socket.IO — testável isoladamente.

## Banco de músicas e admin

- `data/musicas.json`: lista de objetos `{ id, titulo, artista, ano }`. A dica de quantidade de palavras é derivada do título; cantor e ano vêm do registro.
- O projeto nasce com **seed de ~40 músicas brasileiras conhecidas**, variadas em década e gênero.
- `/admin` busca na **API pública da Wikipedia em português** (`pt.wikipedia.org/w/api.php`), autopreenche artista/ano a partir do resultado, permite editar antes de salvar no JSON. Sem internet, o admin funciona em modo manual (digitar tudo).
- Músicas já sorteadas na partida atual não se repetem. Se o banco esgotar no meio da partida, a partida encerra mais cedo com aviso no display.

## Visual — Neo-Retro

As três telas seguem os wireframes em `neoretro/` e o design system `neoretro/neo_retro_design_system/DESIGN.md`:

- Fundo creme `#f8f1e4`, texto `#3c2f2f`, paleta amarelo `#f9c629` / magenta / ciano / laranja / verde.
- Bordas de 4px em `#3c2f2f`, sombras duras `4px 4px 0px`, cantos 12px.
- Fonte Plus Jakarta Sans, peso 800 em títulos.
- Os `code.html` dos wireframes servem de ponto de partida para o markup real.
- Textos em inglês dos wireframes são traduzidos ("Buy Hints" → "Comprar Dicas", "Top Pairs" → "Ranking", "Got it!" → "Acertou!").
- **Fora do v1** (enfeites de wireframe): navegação lateral Achievements/History/Support, perfil com nível, tema "Next up".

## Tratamento de erros

- **Celular caiu**: reconecta pela identidade em `localStorage` e reassume a vaga. Se um jogador da dupla ativa estiver desconectado, a rodada não inicia (aviso no display).
- **Servidor reiniciado**: partida zera; jogadores reentram pelo QR.
- **Wikipedia fora do ar / sem internet**: o jogo funciona normalmente com o banco local; só a busca do admin degrada para cadastro manual.

## Testes

- **Automatizados** (`node:test`, sem dependências extras): motor do jogo — máquina de estados, rotação de duplas e papéis, decaimento do valor, custo de dicas, placar, condição de fim, não-repetição de músicas.
- **Manuais**: fluxo das telas jogando de verdade (notebook + 2 celulares), incluindo reconexão.

## Estrutura de arquivos

```
HUM-A-TUNE/
├── config.json
├── package.json
├── data/musicas.json
├── src/
│   ├── server.js        # Express + Socket.IO + rotas
│   ├── game.js          # motor do jogo (puro, testável)
│   └── wikipedia.js     # busca/extração para o admin
├── public/
│   ├── display/         # tela central
│   ├── jogar/           # tela do celular
│   ├── admin/           # gestão do banco
│   └── shared/          # CSS do design system, utilitários
├── test/game.test.js
├── neoretro/            # wireframes e design system (referência)
└── docs/superpowers/specs/
```

## Fora de escopo do v1

- Dica de melodia via biblioteca MIDI.
- Interação da plateia (ganhar/tirar pontos de fora).
- Distinção "já ouviu / não ouviu a música" na pontuação da mímica.
- Persistência de partidas, histórico, conquistas, perfis.
- Deploy na internet.
