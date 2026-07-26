# Design — Sugestões de músicas pelos telefones ociosos

Data: 2026-07-26 · Status: aprovado (instrução direta do usuário, com restrição de deploy)

## Objetivo

Jogador ocioso (plateia durante a rodada, ou esperando no lobby) pode pesquisar
músicas (iTunes) e **sugerir** adições ao banco. As sugestões ficam armazenadas
para o dono avaliar depois. **Restrição dura:** havia uma sala em jogo no momento
da implementação — nada pode exigir reinício do servidor para os jogadores atuais.

## Estratégia de deploy em duas fases

- **Fase A (quente, sem restart):** só arquivos em `public/` — o `express.static`
  lê do disco a cada request, então o telefone ganha a UI no próximo carregamento
  da página (o rejoin por `localStorage` reconecta sem atrito). A busca usa o
  `GET /api/buscar` que JÁ existe no servidor em execução.
- **Fase B (código de servidor):** `POST /api/sugestoes` grava em
  `data/sugestoes.jsonl`. Entra no ar num restart feito **somente quando nenhum
  jogador estiver conectado** (vigia automático via `/api/monitor`).
- **Ponte entre as fases:** se o POST falhar (404 no servidor antigo, ou rede),
  o celular guarda a sugestão na fila `localStorage.desafinoSugestoesPendentes`
  e reenvia sozinho (no carregamento e a cada 60s). Nada se perde.

## Componentes

### Frontend (`public/jogar/`)

- Seção `#sugerir` (card "💡 Sugerir música") FORA do sistema de telas
  (`mostrarTela` esconde `.tela`; esta seção é alternada por conta própria).
- Visível quando: `fase === 'lobby'` e o jogador entrou, OU papel `plateia`
  durante rodada (fora do interlúdio de resultado).
- Busca → lista de resultados com botão **Sugerir**; envia
  `{titulo, artista, ano, genero, sala, sugeridoPor}` (sala e nome do perfil).
- Status pt-BR: enviada ✅ / guardada no aparelho 📦.

### Backend (`src/server.js`, Fase B)

- Opção nova `sugestoesArquivo` (padrão `data/sugestoes.jsonl`; testes usam temp).
- `POST /api/sugestoes`: valida título (obrigatório, string), sane campos
  (limites de tamanho, ano numérico), grava linha JSONL com `ts`, responde 201.
  Registra evento `musicaSugerida` (aparece no feed do `/monitor`).
- `GET /api/sugestoes?token=` (token do monitor): lista para avaliação; 403 sem token.
- `data/sugestoes.jsonl` no `.gitignore`; no Docker vive no volume `dados`.

### Avaliação

Quem avalia é o **desenvolvedor** (Rodrigo), não o dono da sala: as sugestões só
existem no servidor — `data/sugestoes.jsonl` ou `GET /api/sugestoes?token=` (token
do monitor). O display não tem acesso. Aprovação por ora é manual via `/admin`;
botões aprovar/descartar ficam para depois (YAGNI).

## Testes

Integração: POST válido → 201 + linha no arquivo + evento `musicaSugerida`;
POST sem título → 400; GET sem token → 403; GET com token devolve a sugestão.
