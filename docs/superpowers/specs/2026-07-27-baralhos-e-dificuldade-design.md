# Design — Baralhos, classificação de dificuldade e aposta

Data: 2026-07-27 · Status: aprovado

## Contexto

Este é o **sub-projeto A** da expansão do Hum-a-Tune, agora ampliado: além de
baralhos e bibliotecas, passa a incluir a classificação de dificuldade das cartas
e a mecânica de aposta que se apoia nela.

| # | Sub-projeto | Situação |
|---|---|---|
| **C** | Controle da sala, configuração e juízo coletivo | implementado |
| **A** | Baralhos, dificuldade e aposta | **este documento** |
| **B** | Dicas 2.0 (forca legível, língua, dicas por tipo de baralho) | depende de A |
| **D** | Modos de jogo (solo e derivados) | depende de A |

## Decomposição

A é grande demais para um plano só. Quatro entregas, nesta ordem:

| | Entrega | Depende de |
|---|---|---|
| **A1+A2** | Campo de carta (`tipo`, `tags`, `dificuldade`) nos 1340 itens, preenchido numa passada só de IA; migração; `/admin` mostra os campos. Nada muda no jogo. | — |
| **A3** | Baralhos de música: nacional, internacional, décadas, gêneros. Seleção no lobby. | A1+A2 |
| **A4** | A aposta: escolha do nível, multiplicador, limiar de virada. | A1+A2 |
| **A3b** | Deck do Oscar (filmes, via Wikidata) — **junto com o sub-projeto B**, porque filme muda quais dicas fazem sentido. | A3 + B |

A3, A4 e A3b são independentes entre si; todos precisam de A1+A2.

**A1 e A2 viraram uma entrega só.** `tipo`, `tags` e `dificuldade` saem da mesma
leitura da carta; separar em duas passadas dobraria o custo sem ganhar nada.

## 1. O modelo de carta (A1)

Hoje uma música é `{ id, titulo, artista, ano, genero? }`. Passa a ser:

```
{ id, tipo, titulo, artista, ano, genero?, tags[], dificuldade }
```

- **`tipo`**: `'musica'` por enquanto; `'filme'` entra em A3. É o que permite a B
  saber que "cantor" não é dica válida para filme.
- **`tags`**: lista curta e minúscula (`nacional`, `internacional`, `samba`,
  `trilha-sonora`, `oscar`). Uma carta pode estar em vários pacotes sem duplicar.
- **`dificuldade`**: inteiro `1` (fácil), `2` (média) ou `3` (difícil). Numérico e
  não texto porque a tabela de multiplicadores indexa por ele e a ordenação importa.

**Migração:** os 1340 itens atuais recebem `tipo: 'musica'`, `tags: []` e
`dificuldade: 2`. Média é o padrão honesto — não finge conhecimento que não temos,
e mantém o jogo idêntico ao de hoje até A2 rodar.

## 2. O critério de dificuldade (A2)

Esta é a parte que decide se a classificação presta, então fica escrita.

**Dificuldade não é obscuridade.** É *quão difícil é o parceiro chegar no título
tendo só melodia cantarolada ou mímica*. Quatro fatores:

1. **Fama no Brasil.** A mesa precisa conhecer a carta. Sucesso internacional que
   não tocou aqui é difícil mesmo sendo famoso lá fora.
2. **A melodia carrega sozinha?** Rap, funk e faixas cujo apelo está na letra ou na
   batida são difíceis mesmo sendo ícones. *Diário de um Detento* é clássico
   absoluto e quase impossível de cantarolar. Este é o fator que nenhuma
   heurística de popularidade capta, e é o motivo de a classificação ser por IA.
3. **O título está no refrão?** "Evidências" grita o próprio nome; "Serra do Luar"
   não aparece em lugar nenhum que ajude.
4. **Ambiguidade.** Título genérico ou regravação famosa confunde o palpite.

**Âncoras**, para a classificação não derivar entre lotes:

- **1 — fácil:** Evidências, Garota de Ipanema, Ilariê, Bohemian Rhapsody
- **2 — média:** Nem um Dia, Comfortably Numb, Sinais de Fogo
- **3 — difícil:** Diário de um Detento, Alvorada, Serra do Luar

**Processo:** classificação offline em lotes, fora do servidor — não há chamada de
IA em tempo de jogo e nenhuma dependência nova no projeto. A saída de cada lote é
`{ id, tipo, tags, dificuldade, motivo }` — a mesma leitura resolve os três campos. O `motivo` vai para
`data/dificuldade-motivos.json`, **fora** de `data/musicas.json`: permite auditar e
reclassificar sem inchar o banco que o jogo lê a cada partida.

**Reexecutável:** rodar de novo só classifica carta sem nota. Quando o banco
crescer, o mesmo processo cobre as novas sem tocar nas antigas.

**Revisão por amostra:** depois do lote, conferir 30 cartas sorteadas contra o
critério. Se mais de 5 discordarem, o critério ou as âncoras estão errados —
ajustar e reclassificar, em vez de corrigir carta a carta.

## 3. Os baralhos (A3)

Decisões já tomadas: tags na carta e não arquivos separados; **um baralho por
partida**, escolhido pelo líder no lobby; pacotes curados por nós, fixos no
repositório.

Um baralho é um filtro nomeado. Os do lançamento, e de onde sai cada um:

| Baralho | Filtro | Precisa de quê |
|---|---|---|
| Todas as músicas | nenhum | nada (é o padrão de hoje) |
| Nacional | `tags` contém `nacional` | passada de IA |
| Internacional | `tags` contém `internacional` | passada de IA |
| Anos 80 / 90 / 2000 | faixa de `ano` | **nada** — o ano já está na carta |
| Samba e pagode | `genero` em {Samba, Pagode} | mapa de agrupamento de gêneros |
| Sertanejo | `genero` = Sertanejo | mapa de agrupamento |
| Rock | `genero` em {Rock, Hard rock, Metal, Alternativo} | mapa de agrupamento |

Os rótulos de gênero do iTunes são inconsistentes e numerosos (49 distintos), então
o agrupamento é um mapa explícito no código, não um `filter` por igualdade. Ele mora
junto da definição dos baralhos: é a mesma decisão de curadoria.

**Tamanho mínimo:** um baralho precisa de cartas suficientes para uma partida
inteira sem repetir. Com 8 rodadas de padrão, qualquer pacote abaixo de ~30 cartas
não deve ser publicado. Samba+pagode dá 90, sertanejo 66, rock 173 — todos passam.

### Trilhas de filme e o deck do Oscar (A3b)

Fica para depois, junto do sub-projeto B, e por um motivo de conteúdo e não de
código: carta de filme muda quais dicas fazem sentido. "Cantor" e "década" não se
aplicam, e a forca precisa lidar com títulos longos em inglês. Entregar filme sem
mexer nas dicas seria entregar meia funcionalidade.

**Fonte de dados: Wikidata via SPARQL.** O IMDb não tem API pública gratuita, e os
wrappers (OMDb) exigem chave. O Wikidata não exige chave, não adiciona dependência
— é HTTPS puro — e tem prêmio como dado estruturado. Verificado na prática:

- `?filme wdt:P166 wd:Q102427` devolve os vencedores de Melhor Filme
- filtrar por `wdt:P31 wd:Q11424` é **obrigatório**: sem isso vêm produtores e
  diretores junto, porque no Wikidata eles também "recebem" o prêmio
- agrupar por título com `MIN(ano)` remove as duplicatas de múltiplas datas de estreia
- o rótulo em `pt-br` traz o título brasileiro, que é o que a mesa reconhece

Resultado da consulta validada: **98 vencedores, de 1927 a 2025**, com título em
português. Suficiente para um baralho inteiro.

**Indicados ficam para uma segunda etapa:** a consulta que inclui indicações
(`p:P1411`) estoura o timeout do endpoint público. Vai precisar de paginação por
ano ou por década.

## 4. A aposta (A4)

### O multiplicador

O pote ganha um fator no fim:

```
valorAtual = max(0, round((config.modos[r.modo] − Σ gastos) × fator))
```

| nível | fator |
|---|---|
| 1 — fácil | 0,7 |
| 2 — média | 1,0 |
| 3 — difícil | 1,5 |

Multiplicar **depois** de subtrair, não antes. Como o roubo da plateia é percentual
sobre o pote, ele escala junto — coerente, e sem regra nova.

### A escolha

O apresentador escolhe o nível **antes de começar a rodada**, na fase
`aguardandoInicio`. A carta é sorteada **dentro do nível escolhido**, e ele não a vê
antes de escolher: é aposta no escuro, não seleção.

Depois que o cronômetro anda, não há escolha — senão não é aposta, é retrospectiva.

**Monte vazio:** se o baralho escolhido não tiver carta inédita naquele nível, cai
para o nível vizinho mais próximo e avisa na tela de quem apresenta. Um baralho
pequeno filtrado por nível esvazia rápido, e travar a rodada seria pior que
entregar uma carta de nível adjacente.

### Quando a aposta está liberada

Duas portas, e basta uma:

1. **Estreia:** é a primeira rodada daquela dupla. Todo mundo começa podendo
   arriscar. Sai de graça da rotação que já existe — a estreia de cada dupla é
   `jogo.rodadasJogadas < jogo.duplasAtivas.length`, sem estado novo. No duelo x1
   a unidade é o jogador, então valem as duas primeiras rodadas.
2. **Virada:** a dupla está **20% ou mais atrás do líder**, com o líder somando
   mais que zero. A margem é knob do líder.

**Sem aposta liberada, o sorteio é do baralho inteiro e o fator é 1,0** — a
dificuldade da carta simplesmente não entra na conta. É exatamente o
comportamento de hoje, e é a leitura certa: o multiplicador paga a *escolha*, não
o azar. Uma carta difícil que caiu sem ninguém ter apostado nela não vale mais,
porque ninguém arriscou nada por ela.

O líder do placar joga assim. A aposta é alavanca de quem está atrás, e é isso que
mantém a partida viva em vez de decidida na quarta rodada.

**No duelo x1** o placar é individual, então "líder" é o jogador com mais pontos e
a comparação é entre jogadores, não entre duplas.

### Errar apostando

**Não tira pontos.** A rodada vale zero, como qualquer rodada perdida hoje.

O risco não sumiu, mudou de lugar: quem aposta no difícil aceita uma chance menor
de pontuar, e o valor esperado já pune a ousadia mal calibrada. Somar uma multa a
isso, numa mecânica que só destrava para quem está perdendo, empurraria o perdedor
mais para baixo — o oposto do objetivo.

## 5. Testes

- **A1:** migração preenche os três campos em todas as cartas; carta sem `tags` ou
  `dificuldade` recebe padrão em vez de quebrar; `/admin` salva e lê os campos novos.
- **A2:** o script só classifica carta sem nota; rodar duas vezes não muda nada;
  motivo gravado fora do banco.
- **A4 (motor):** multiplicador aplicado depois dos gastos e arredondado; sem
  aposta o fator é 1,0 e o sorteio ignora a dificuldade; sorteio com aposta
  respeita o nível; monte vazio cai para o vizinho; estreia libera para todos;
  virada libera só para quem está atrás; líder com zero ponto não libera ninguém;
  nível bloqueado é recusado; escolher fora de `aguardandoInicio` é recusado.
- **A4 (servidor):** socket só do apresentador; estado privado expõe quais níveis
  estão liberados; roubo da plateia escala junto com o multiplicador.

## 6. Riscos

1. **Classificação errada é visível na mesa.** Uma carta marcada difícil que todo
   mundo acerta de primeira queima a mecânica. A revisão por amostra existe por
   isso, e o `motivo` gravado permite discutir o caso concreto em vez do palpite.
2. **Dificuldade depende da mesa.** Numa roda de cinquentões, Roberto Carlos é fácil
   e Anitta é impossível; numa de vinte e poucos, o inverso. Nenhuma etiqueta fixa
   acerta as duas. O log de partidas já registra acerto e erro por carta, então
   corrigir a nota com dado real é possível depois — fora do escopo deste spec, mas
   é a evolução natural e o motivo de `dificuldade` ser um campo editável e não um
   valor derivado em tempo de execução.
3. **Baralho pequeno filtrado por nível esvazia rápido.** O fallback para o nível
   vizinho cobre, mas um deck curado precisa de cartas suficientes nos três níveis
   para a escolha significar algo. Vale medir a distribuição por nível de cada
   pacote em A3, antes de publicá-lo.
