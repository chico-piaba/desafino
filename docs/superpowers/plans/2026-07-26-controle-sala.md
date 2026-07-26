# Controle da Sala, Configuração e Juízo Coletivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o controle da sala da TV e dar ao líder (primeiro jogador a entrar), com configuração por sala, troca de música pelo apresentador, votação da plateia para confirmar acerto, e palpite da plateia que rouba pontos.

**Architecture:** O motor (`src/game.js`) continua puro e sem noção de rede — quem sabe quem está conectado é o servidor, que passa listas de eleitores para o motor. Três módulos novos saem do caminho: `src/texto.js` (comparação tolerante), `src/configSala.js` (defaults e knobs) e `src/dicas.js` (extraído do `game.js`, que já estava grande). O `config.json` deixa de ser injetado direto no jogo e passa a ser default de uma cópia por sala.

**Tech Stack:** Node.js (CommonJS, sem transpilação), Express 4, Socket.IO 4, `node --test` (test runner nativo), front-end em JS puro sem build.

## Global Constraints

- Todo o código, comentários, mensagens de erro e textos de UI em **português do Brasil**.
- CommonJS (`require`/`module.exports`) e `'use strict';` no topo de todo arquivo em `src/`.
- Sem dependências novas. Levenshtein é implementado à mão.
- Testes com `node:test` + `node:assert`; rodar tudo com `npm test`.
- `src/game.js` permanece **puro**: não conhece sockets, `Date.now()`, timers nem conexões. Tudo que depende de quem está online chega por parâmetro.
- **Um pote por rodada, que nunca reseta:** dicas, ações e roubos só subtraem, e a troca de música não devolve nada.
- Nomes de campo em português, como no código existente (`valorAtual`, `dicasCompradas`, `pontosGanhos`).
- Commits pequenos, um por tarefa, mensagem em português no formato já usado no repo (linha de assunto imperativa, sem prefixo `feat:`).

---

### Task 1: Módulo de comparação tolerante (`src/texto.js`)

Base para o palpite da plateia. Não depende de nada e nada ainda depende dele.

**Files:**
- Create: `src/texto.js`
- Test: `test/texto.test.js`

**Interfaces:**
- Consumes: nada
- Produces:
  - `normalizar(texto: string) => string` — minúsculas, sem acento, sem parênteses, sem pontuação, sem artigo inicial, espaços colapsados
  - `distancia(a: string, b: string) => number` — Levenshtein
  - `pareceCerto(palpite: string, titulo: string) => boolean`

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/texto.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizar, distancia, pareceCerto } = require('../src/texto');

test('normalizar tira caixa, acento e pontuação', () => {
  assert.strictEqual(normalizar('EVIDÊNCIAS!!'), 'evidencias');
  assert.strictEqual(normalizar("Don't Stop Me Now"), 'dont stop me now');
  assert.strictEqual(normalizar('Trem-Bala'), 'trem bala');
});

test('normalizar tira trecho entre parênteses e artigo inicial', () => {
  assert.strictEqual(normalizar('Evidências (Ao Vivo)'), 'evidencias');
  assert.strictEqual(normalizar('A Garota de Ipanema'), 'garota de ipanema');
  assert.strictEqual(normalizar('The Wall'), 'wall');
});

test('normalizar não engole um título que é só o artigo', () => {
  assert.strictEqual(normalizar('A'), 'a');
});

test('distancia conta edições', () => {
  assert.strictEqual(distancia('abc', 'abc'), 0);
  assert.strictEqual(distancia('abc', 'abd'), 1);
  assert.strictEqual(distancia('abc', ''), 3);
});

test('pareceCerto aceita erro de digitação proporcional ao tamanho', () => {
  assert.ok(pareceCerto('evidencias', 'Evidências'));
  assert.ok(pareceCerto('EVIDÊNCIAS!!', 'Evidências'));
  assert.ok(pareceCerto('evidencas', 'Evidências')); // 1 erro, limiar 2
  assert.ok(pareceCerto('a garota de ipanema', 'Garota de Ipanema'));
});

test('pareceCerto rejeita título diferente e palpite vazio', () => {
  assert.ok(!pareceCerto('evidente', 'Evidências'));
  assert.ok(!pareceCerto('aquarela', 'Evidências'));
  assert.ok(!pareceCerto('   ', 'Evidências'));
  assert.ok(!pareceCerto('sim', 'Não'));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/texto.test.js`
Expected: FAIL — `Cannot find module '../src/texto'`

- [ ] **Step 3: Implementar `src/texto.js`**

```js
'use strict';

// Artigos que o povo engole ou acrescenta sem pensar ao dizer um título.
const ARTIGOS = ['o', 'a', 'os', 'as', 'the'];

function normalizar(texto) {
  const limpo = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos (combinantes, pós-NFD)
    .replace(/\([^)]*\)/g, ' ') // "(Ao Vivo)", "(Remix)"
    .replace(/[^a-z0-9\s]/g, ' ') // pontuação
    .replace(/\s+/g, ' ')
    .trim();
  const partes = limpo.split(' ');
  // Só derruba o artigo se sobrar título: "A" sozinha continua sendo "a".
  if (partes.length > 1 && ARTIGOS.includes(partes[0])) partes.shift();
  return partes.join(' ');
}

function distancia(a, b) {
  // Levenshtein com duas linhas — títulos são curtos, não precisa de matriz.
  if (a === b) return 0;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

function pareceCerto(palpite, titulo) {
  const p = normalizar(palpite);
  const t = normalizar(titulo);
  if (!p || !t) return false;
  // Título longo tolera mais dedo gordo; teto de 3 para não virar vale-tudo.
  const limiar = Math.min(3, Math.floor(t.length / 8) + 1);
  return distancia(p, t) <= limiar;
}

module.exports = { normalizar, distancia, pareceCerto };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/texto.test.js`
Expected: PASS — 6 testes

- [ ] **Step 5: Commit**

```bash
git add src/texto.js test/texto.test.js
git commit -m "Comparação tolerante de palpites (acento, pontuação, artigo, digitação)"
```

---

### Task 2: Defaults e knobs da sala (`src/configSala.js`)

**Files:**
- Create: `src/configSala.js`
- Modify: `config.json`
- Test: `test/configSala.test.js`

**Interfaces:**
- Consumes: nada
- Produces:
  - `PADROES` — objeto com as seções `rodada`, `modos`, `x1`, `dicas`, `sala`, `troca`, `plateia`
  - `mesclarPadroes(config: object) => object` — completa seções faltantes
  - `aplicarKnobs(config: object, knobs: object) => object` — novo objeto, valores saturados na faixa
  - `KNOBS` — mapa `nomeDoKnob -> { caminho, min, max, booleano }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/configSala.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PADROES, mesclarPadroes, aplicarKnobs } = require('../src/configSala');

test('mesclarPadroes completa seções que faltam no config.json antigo', () => {
  const antigo = {
    rodada: { duracaoSegundos: 60, totalRodadas: 8 },
    modos: { cantarolar: 100, mimica: 70 },
    dicas: { cantor: 10 },
  };
  const c = mesclarPadroes(antigo);
  assert.strictEqual(c.rodada.duracaoSegundos, 60); // respeita o que veio
  assert.strictEqual(c.sala.maxDuplas, PADROES.sala.maxDuplas); // completa o que faltou
  assert.strictEqual(c.plateia.rouboFracao, 0.05);
  assert.strictEqual(c.troca.custo, 20);
});

test('mesclarPadroes não muda o objeto original', () => {
  const antigo = { rodada: { duracaoSegundos: 60 } };
  mesclarPadroes(antigo);
  assert.strictEqual(antigo.sala, undefined);
});

test('aplicarKnobs satura valores fora da faixa', () => {
  const c = aplicarKnobs(PADROES, { duracaoSegundos: 5, totalRodadas: 999, maxDuplas: 50 });
  assert.strictEqual(c.rodada.duracaoSegundos, 30);
  assert.strictEqual(c.rodada.totalRodadas, 20);
  assert.strictEqual(c.sala.maxDuplas, 10);
});

test('aplicarKnobs aceita valores válidos e booleanos', () => {
  const c = aplicarKnobs(PADROES, {
    duracaoSegundos: 120, maxDuplas: 6, trocaCusto: 30,
    trocaMusica: false, palpitePlateia: false, votacaoPlateia: true, rouboFracao: 0.1,
  });
  assert.strictEqual(c.rodada.duracaoSegundos, 120);
  assert.strictEqual(c.sala.maxDuplas, 6);
  assert.strictEqual(c.troca.custo, 30);
  assert.strictEqual(c.troca.ligada, false);
  assert.strictEqual(c.plateia.palpite, false);
  assert.strictEqual(c.plateia.votacao, true);
  assert.strictEqual(c.plateia.rouboFracao, 0.1);
});

test('aplicarKnobs ignora knob desconhecido e valor não numérico', () => {
  const c = aplicarKnobs(PADROES, { hackeado: 999, duracaoSegundos: 'muito' });
  assert.strictEqual(c.hackeado, undefined);
  assert.strictEqual(c.rodada.duracaoSegundos, PADROES.rodada.duracaoSegundos);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/configSala.test.js`
Expected: FAIL — `Cannot find module '../src/configSala'`

- [ ] **Step 3: Implementar `src/configSala.js`**

```js
'use strict';

const PADROES = {
  rodada: { duracaoSegundos: 90, totalRodadas: 8 },
  modos: { cantarolar: 100, mimica: 70 },
  x1: { bonusApresentador: 0.5 },
  dicas: { cantor: 10, ano: 10, decada: 5, genero: 10, inicialDoTitulo: 15, forca: 25 },
  sala: { maxDuplas: 4, maxJogadores: 20 },
  troca: { ligada: true, custo: 20, porRodada: 1 },
  plateia: {
    palpite: true,
    rouboFracao: 0.05,
    bonusFracao: 0.5,
    votacao: true,
    votacaoSegundos: 10,
    palpiteIntervaloMs: 2000,
  },
};

// Só o que o líder ajusta no lobby. bonusFracao, votacaoSegundos e
// palpiteIntervaloMs ficam de fora de propósito: são balanceamento fino,
// não decisão de mesa.
const KNOBS = {
  duracaoSegundos: { caminho: ['rodada', 'duracaoSegundos'], min: 30, max: 180 },
  totalRodadas: { caminho: ['rodada', 'totalRodadas'], min: 4, max: 20 },
  maxDuplas: { caminho: ['sala', 'maxDuplas'], min: 1, max: 10 },
  trocaMusica: { caminho: ['troca', 'ligada'], booleano: true },
  trocaCusto: { caminho: ['troca', 'custo'], min: 0, max: 50 },
  palpitePlateia: { caminho: ['plateia', 'palpite'], booleano: true },
  rouboFracao: { caminho: ['plateia', 'rouboFracao'], min: 0, max: 0.2 },
  votacaoPlateia: { caminho: ['plateia', 'votacao'], booleano: true },
};

function mesclarPadroes(config) {
  const saida = {};
  for (const [secao, valores] of Object.entries(PADROES)) {
    saida[secao] = { ...valores, ...((config && config[secao]) || {}) };
  }
  return saida;
}

function aplicarKnobs(config, knobs) {
  const saida = mesclarPadroes(config);
  for (const [nome, bruto] of Object.entries(knobs || {})) {
    const knob = KNOBS[nome];
    // Knob desconhecido é descartado em silêncio: um cliente desatualizado
    // não pode derrubar a configuração da sala inteira.
    if (!knob) continue;
    const [secao, chave] = knob.caminho;
    if (knob.booleano) {
      saida[secao][chave] = Boolean(bruto);
      continue;
    }
    const numero = Number(bruto);
    if (!Number.isFinite(numero)) continue;
    saida[secao][chave] = Math.min(knob.max, Math.max(knob.min, numero));
  }
  return saida;
}

module.exports = { PADROES, KNOBS, mesclarPadroes, aplicarKnobs };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/configSala.test.js`
Expected: PASS — 5 testes

- [ ] **Step 5: Atualizar o `config.json` com as chaves novas**

Substituir o conteúdo de `config.json` por:

```json
{
  "rodada": { "duracaoSegundos": 90, "totalRodadas": 8 },
  "modos": { "cantarolar": 100, "mimica": 70 },
  "x1": { "bonusApresentador": 0.5 },
  "dicas": { "cantor": 10, "ano": 10, "decada": 5, "genero": 10, "inicialDoTitulo": 15, "forca": 25 },
  "sala": { "maxDuplas": 4, "maxJogadores": 20 },
  "troca": { "ligada": true, "custo": 20, "porRodada": 1 },
  "plateia": {
    "palpite": true,
    "rouboFracao": 0.05,
    "bonusFracao": 0.5,
    "votacao": true,
    "votacaoSegundos": 10,
    "palpiteIntervaloMs": 2000
  }
}
```

- [ ] **Step 6: Cobrir as seções novas em `test/config.test.js`**

`test/config.test.js` compara seção a seção com `deepStrictEqual`, então acrescentar seções não quebra o teste existente. Acrescentar ao fim do arquivo:

```js
test('config tem os limites da sala, a troca e as regras da plateia', () => {
  assert.deepStrictEqual(config.sala, { maxDuplas: 4, maxJogadores: 20 });
  assert.deepStrictEqual(config.troca, { ligada: true, custo: 20, porRodada: 1 });
  assert.deepStrictEqual(config.plateia, {
    palpite: true, rouboFracao: 0.05, bonusFracao: 0.5,
    votacao: true, votacaoSegundos: 10, palpiteIntervaloMs: 2000,
  });
});
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/configSala.js test/configSala.test.js config.json test/config.test.js
git commit -m "Configuração por sala: defaults, knobs do líder e saturação de faixa"
```

---

### Task 3: Extrair as dicas para `src/dicas.js`

Refactor puro: nenhum comportamento muda, os testes existentes continuam valendo.

**Files:**
- Create: `src/dicas.js`
- Modify: `src/game.js` (remove `primeiraLetra`, `gerarForca`, `conteudoDica`, `dicasDisponiveis`; passa a requerer o módulo novo e a reexportar)

**Interfaces:**
- Consumes: nada
- Produces:
  - `primeiraLetra(titulo: string) => string`
  - `gerarForca(titulo: string, revelarInicial: boolean) => string`
  - `conteudoDica(musica: object, tipo: string, dicasCompradas: Array) => string`
  - `dicasDisponiveis(config: object, musica: object) => object`
  - `game.gerarForca` e `game.dicasDisponiveis` continuam existindo (reexportados), porque `test/game.test.js` e `src/server.js` os chamam.

- [ ] **Step 1: Criar `src/dicas.js` movendo as quatro funções**

Recortar de `src/game.js` as funções `primeiraLetra` (linhas 147-150), `gerarForca` (152-165), `conteudoDica` (167-184) e `dicasDisponiveis` (186-190) — sem alterar uma linha do corpo — para o arquivo novo:

```js
'use strict';

function primeiraLetra(titulo) {
  const letra = [...String(titulo)].find((c) => /[\p{L}\p{N}]/u.test(c));
  return letra ? letra.toUpperCase() : '?';
}

function gerarForca(titulo, revelarInicial) {
  let primeira = true;
  return [...String(titulo).trim()]
    .map((c) => {
      if (/[\p{L}\p{N}]/u.test(c)) {
        const ehPrimeira = primeira;
        primeira = false;
        if (ehPrimeira && revelarInicial) return c.toUpperCase();
        return '_';
      }
      return c; // espaços e pontuação ficam visíveis, como na forca
    })
    .join(' ');
}

function conteudoDica(musica, tipo, dicasCompradas = []) {
  if (tipo === 'cantor') return musica.artista;
  if (tipo === 'ano') return String(musica.ano);
  if (tipo === 'decada') {
    const decada = Math.floor(musica.ano / 10) * 10;
    return decada >= 2000 ? `Anos ${decada}` : `Anos ${decada % 100}`;
  }
  if (tipo === 'genero') {
    if (!musica.genero) throw new Error('Dica indisponível para esta música');
    return musica.genero;
  }
  if (tipo === 'inicialDoTitulo') return `Começa com "${primeiraLetra(musica.titulo)}"`;
  if (tipo === 'forca') {
    const temInicial = dicasCompradas.some((d) => d.tipo === 'inicialDoTitulo');
    return gerarForca(musica.titulo, temInicial);
  }
  throw new Error('Dica desconhecida');
}

function dicasDisponiveis(config, musica) {
  return Object.fromEntries(
    Object.entries(config.dicas).filter(([tipo]) => tipo !== 'genero' || Boolean(musica.genero))
  );
}

module.exports = { primeiraLetra, gerarForca, conteudoDica, dicasDisponiveis };
```

- [ ] **Step 2: Ligar o `game.js` ao módulo novo**

No topo de `src/game.js`, logo abaixo de `const crypto = require('crypto');`, adicionar:

```js
const dicas = require('./dicas');
```

Em `comprarDica`, trocar as duas chamadas a `conteudoDica(...)` por `dicas.conteudoDica(...)`.

No `module.exports` do fim do arquivo, trocar as linhas `dicasDisponiveis,` e `gerarForca,` por:

```js
  dicasDisponiveis: dicas.dicasDisponiveis,
  gerarForca: dicas.gerarForca,
```

- [ ] **Step 3: Rodar a suíte para provar que nada mudou**

Run: `npm test`
Expected: PASS — todos os testes existentes, inclusive `gerarForca esconde letras...` e `forca comprada antes da inicial é atualizada...`

- [ ] **Step 4: Commit**

```bash
git add src/dicas.js src/game.js
git commit -m "Extrai as dicas do motor para src/dicas.js"
```

---

### Task 4: Configuração por jogo e limite de duplas

**Files:**
- Modify: `src/game.js` (`criarJogo`, `entrarJogador`, `prepararRodada`)
- Test: `test/game.test.js` (testes novos ao fim do arquivo)

**Interfaces:**
- Consumes: `mesclarPadroes` da Task 2
- Produces:
  - `jogo.config` sempre completo (todas as seções de `PADROES`), mesmo quando `criarJogo` recebe um config parcial
  - `entrarJogador` valida contra `jogo.config.sala.maxDuplas` e `jogo.config.sala.maxJogadores`
  - `jogo.rodada` passa a ter `acoes: []`, `roubos: []`, `duplasQueRoubaram: []`, `trocasUsadas: 0`, `votacao: null`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/game.test.js`:

```js
test('criarJogo completa o config com os padrões', () => {
  const jogo = game.criarJogo({ rodada: { duracaoSegundos: 60 } }, MUSICAS);
  assert.strictEqual(jogo.config.rodada.duracaoSegundos, 60);
  assert.strictEqual(jogo.config.sala.maxDuplas, 4);
  assert.strictEqual(jogo.config.plateia.rouboFracao, 0.05);
});

test('maxDuplas maior libera duplas acima de 4', () => {
  const jogo = game.criarJogo({ ...CONFIG, sala: { maxDuplas: 10, maxJogadores: 20 } }, MUSICAS);
  const j = game.entrarJogador(jogo, 'Ana', 7, 'a');
  assert.strictEqual(j.dupla, 7);
  assert.throws(() => game.entrarJogador(jogo, 'Zé', 11), /Dupla inválida/);
});

test('maxJogadores barra a sala lotada', () => {
  const jogo = game.criarJogo({ ...CONFIG, sala: { maxDuplas: 10, maxJogadores: 4 } }, MUSICAS);
  game.entrarJogador(jogo, 'A', 1, 'a');
  game.entrarJogador(jogo, 'B', 1, 'b');
  game.entrarJogador(jogo, 'C', 2, 'c');
  game.entrarJogador(jogo, 'D', 2, 'd');
  assert.throws(() => game.entrarJogador(jogo, 'E', 3), /lotada/);
});

test('a rodada nasce com os campos de ação, roubo e votação', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  const r = jogo.rodada;
  assert.deepStrictEqual(r.acoes, []);
  assert.deepStrictEqual(r.roubos, []);
  assert.deepStrictEqual(r.duplasQueRoubaram, []);
  assert.strictEqual(r.trocasUsadas, 0);
  assert.strictEqual(r.votacao, null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/game.test.js`
Expected: FAIL — `jogo.config.sala` é `undefined`; a dupla 7 é rejeitada; `r.acoes` é `undefined`

- [ ] **Step 3: Implementar em `src/game.js`**

No topo, ao lado do `require` das dicas:

```js
const { mesclarPadroes } = require('./configSala');
```

Trocar o `criarJogo` para mesclar o config:

```js
function criarJogo(config, musicas, rng = Math.random) {
  return {
    config: mesclarPadroes(config),
    musicas,
    rng,
    fase: 'lobby',
    modo: 'duplas',
    jogadores: [],
    duplas: {},
    pontosJogadores: {},
    duplasAtivas: [],
    rodada: null,
    rodadasJogadas: 0,
    musicasUsadas: [],
    aviso: null,
    proximoNum: 0,
  };
}
```

Trocar a validação de dupla e lotação em `entrarJogador` (as linhas que hoje testam `![1, 2, 3, 4].includes(duplaNumero)`) por:

```js
  const { maxDuplas, maxJogadores } = jogo.config.sala;
  if (!Number.isInteger(duplaNumero) || duplaNumero < 1 || duplaNumero > maxDuplas) {
    throw new Error(`Dupla inválida — esta sala vai até a dupla ${maxDuplas}`);
  }
  if (jogo.jogadores.length >= maxJogadores) throw new Error('Sala lotada');
  if (jogo.jogadores.filter((j) => j.dupla === duplaNumero).length >= 2) {
    throw new Error('Dupla cheia');
  }
```

Em `prepararRodada`, acrescentar os campos novos ao objeto `jogo.rodada`, logo depois de `dicasCompradas: [],`:

```js
    acoes: [],
    roubos: [],
    duplasQueRoubaram: [],
    trocasUsadas: 0,
    votacao: null,
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — inclusive o teste antigo `entrarJogador valida nome, dupla e lotação`, que espera `/Dupla inválida/` para a dupla 5 com `maxDuplas` 4

- [ ] **Step 5: Commit**

```bash
git add src/game.js test/game.test.js
git commit -m "Config completo por jogo e limite configurável de duplas"
```

---

### Task 5: Trocar música

**Files:**
- Modify: `src/game.js` (`valorAtual`, novo `trocarMusica`, `module.exports`)
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: `jogo.config.troca` (Task 2), campos `acoes`/`trocasUsadas` (Task 4)
- Produces:
  - `trocarMusica(jogo, jogadorId) => musica` — sorteia outra música, cobra `config.troca.custo`, converte o gasto anterior em dicas numa ação `dicasAnteriores` e zera `r.dicasCompradas`
  - `valorAtual(jogo)` passa a descontar `r.acoes` e `r.roubos` além de `r.dicasCompradas`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/game.test.js`:

```js
test('trocar música cobra o custo, sorteia outra e é só do apresentador', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  const antiga = jogo.rodada.musica.id;
  assert.throws(() => game.trocarMusica(jogo, 'b'), /apresentador/);
  const nova = game.trocarMusica(jogo, 'a');
  assert.notStrictEqual(nova.id, antiga);
  assert.strictEqual(jogo.rodada.musica.id, nova.id);
  assert.strictEqual(game.valorAtual(jogo), 80); // 100 − 20
  assert.strictEqual(jogo.rodada.trocasUsadas, 1);
});

test('trocar música não devolve o que já foi gasto em dicas', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.comprarDica(jogo, 'b', 'cantor'); // −10
  game.comprarDica(jogo, 'b', 'forca'); // −25
  game.trocarMusica(jogo, 'a'); // −20
  assert.strictEqual(game.valorAtual(jogo), 45); // 100 − 10 − 25 − 20
  assert.deepStrictEqual(jogo.rodada.dicasCompradas, []); // pode recomprar na música nova
  game.comprarDica(jogo, 'b', 'cantor'); // −10 de novo
  assert.strictEqual(game.valorAtual(jogo), 35);
});

test('trocar música respeita o limite por rodada e a música velha não volta', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  const antiga = jogo.rodada.musica.id;
  game.trocarMusica(jogo, 'a');
  assert.throws(() => game.trocarMusica(jogo, 'a'), /já trocou/);
  assert.ok(jogo.musicasUsadas.includes(antiga));
});

test('troca desligada no config é recusada', () => {
  const jogo = game.criarJogo({ ...CONFIG, troca: { ligada: false, custo: 20, porRodada: 1 } }, MUSICAS, () => 0);
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.entrarJogador(jogo, 'Bia', 2, 'c');
  game.entrarJogador(jogo, 'Leo', 2, 'd');
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.throws(() => game.trocarMusica(jogo, 'a'), /desligada/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/game.test.js`
Expected: FAIL — `game.trocarMusica is not a function`

- [ ] **Step 3: Implementar em `src/game.js`**

Substituir `valorAtual` por:

```js
function valorAtual(jogo) {
  const r = jogo.rodada;
  const v0 = jogo.config.modos[r.modo];
  const soma = (lista, campo) => lista.reduce((total, item) => total + item[campo], 0);
  const gasto = soma(r.dicasCompradas, 'custo') + soma(r.acoes, 'custo') + soma(r.roubos, 'valor');
  return Math.max(0, v0 - gasto);
}
```

Acrescentar, logo depois de `mudarParaMimica`:

```js
function trocarMusica(jogo, jogadorId) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador troca a música');
  if (!jogo.config.troca.ligada) throw new Error('A troca de música está desligada nesta sala');
  if (r.trocasUsadas >= jogo.config.troca.porRodada) {
    throw new Error('Você já trocou a música nesta rodada');
  }
  const nova = sortearMusica(jogo);
  if (!nova) throw new Error('Não há outra música disponível');
  // Pote único que nunca reseta: o gasto em dicas da música antiga vira uma
  // ação e a lista zera, para que as dicas da música nova possam ser compradas.
  const gastoAnterior = r.dicasCompradas.reduce((total, d) => total + d.custo, 0);
  if (gastoAnterior > 0) r.acoes.push({ tipo: 'dicasAnteriores', custo: gastoAnterior });
  r.dicasCompradas = [];
  r.acoes.push({ tipo: 'troca', custo: jogo.config.troca.custo });
  r.trocasUsadas += 1;
  r.musica = nova;
  return nova;
}
```

Acrescentar `trocarMusica,` ao `module.exports`.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game.js test/game.test.js
git commit -m "Apresentador pode trocar a música, com custo no pote único"
```

---

### Task 6: Votação da plateia para confirmar o acerto

**Files:**
- Modify: `src/game.js` (`acertou`, `tempoEsgotado`, novas `adivinhadorAcertou`, `abrirVotacao`, `votar`, `fecharVotacaoPorPrazo`)
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: `jogo.config.plateia.votacao` (Task 2), `r.votacao` (Task 4)
- Produces:
  - `adivinhadorAcertou(jogo, jogadorId, eleitores: number[]) => votacao | null` — `null` quando não há plateia ou a votação está desligada
  - `votar(jogo, jogadorNum: number, acertou: boolean) => { aprovada, origem } | null` — `null` enquanto a votação segue aberta
  - `fecharVotacaoPorPrazo(jogo) => { aprovada, origem }`
  - `tempoEsgotado(jogo, eleitores = [])` — abre a votação se houver plateia; senão encerra com 0 como antes
  - `acertou(jogo, jogadorId)` passa a valer também durante `r.fase === 'votacao'`
  - `r.fase` ganha o valor `'votacao'`

`eleitores` é uma lista de `num` de jogadores — quem monta é o servidor, que sabe quem está conectado.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/game.test.js`:

```js
function jogoCom3Duplas() {
  const jogo = jogoCom2Duplas();
  game.entrarJogador(jogo, 'Carol', 3, 'e');
  game.entrarJogador(jogo, 'Gui', 3, 'f');
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  return jogo; // apresenta 'a' (num 1), adivinha 'b' (num 2); plateia = nums 3,4,5,6
}

test('"eu acertei" abre votação só para a plateia conectada', () => {
  const jogo = jogoCom3Duplas();
  assert.throws(() => game.adivinhadorAcertou(jogo, 'a', [3, 4]), /adivinhador/);
  const v = game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  assert.strictEqual(jogo.rodada.fase, 'votacao');
  assert.strictEqual(v.origem, 'adivinhador');
  assert.deepStrictEqual(v.eleitores, [3, 4]);
});

test('maioria simples aprova e paga o pote descontado', () => {
  const jogo = jogoCom3Duplas();
  game.comprarDica(jogo, 'b', 'cantor'); // −10 → 90
  game.adivinhadorAcertou(jogo, 'b', [3, 4, 5]);
  assert.strictEqual(game.votar(jogo, 3, true), null); // 1 de 3, ainda não
  const r = game.votar(jogo, 4, true); // 2 de 3 → passou de 50%
  assert.strictEqual(r.aprovada, true);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 90);
  assert.strictEqual(jogo.duplas[1].pontos, 90);
});

test('votação reprovada por "eu acertei" devolve a rodada ao andamento', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  game.votar(jogo, 3, false);
  const r = game.votar(jogo, 4, false);
  assert.strictEqual(r.aprovada, false);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
  assert.strictEqual(jogo.rodadasJogadas, 0);
});

test('empate não aprova — exige mais de 50%', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  game.votar(jogo, 3, true);
  const r = game.votar(jogo, 4, false);
  assert.strictEqual(r.aprovada, false);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
});

test('quem não é eleitor não vota', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  assert.throws(() => game.votar(jogo, 99, true), /não vota/);
});

test('tempo esgotado abre votação; reprovada crava 0', () => {
  const jogo = jogoCom3Duplas();
  game.tempoEsgotado(jogo, [3, 4]);
  assert.strictEqual(jogo.rodada.fase, 'votacao');
  assert.strictEqual(jogo.rodada.votacao.origem, 'tempo');
  const r = game.fecharVotacaoPorPrazo(jogo); // ninguém votou
  assert.strictEqual(r.aprovada, false);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 0);
});

test('tempo esgotado com votação aprovada no prazo paga o pote', () => {
  const jogo = jogoCom3Duplas();
  game.tempoEsgotado(jogo, [3, 4, 5]);
  game.votar(jogo, 3, true);
  game.votar(jogo, 4, true);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 100);
});

test('sem plateia não há votação: x1 mantém o comportamento antigo', () => {
  const jogo = jogoX1();
  game.comecarRodada(jogo, 'a');
  assert.strictEqual(game.adivinhadorAcertou(jogo, 'b', []), null);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
  game.tempoEsgotado(jogo, []);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 0);
});

test('votação desligada no config não abre', () => {
  const jogo = jogoCom2Duplas();
  jogo.config.plateia.votacao = false;
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.strictEqual(game.adivinhadorAcertou(jogo, 'b', [3, 4]), null);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
});

test('apresentador resolve na hora mesmo com a votação aberta', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  game.acertou(jogo, 'a');
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.votacao, null);
  assert.strictEqual(jogo.rodada.pontosGanhos, 100);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/game.test.js`
Expected: FAIL — `game.adivinhadorAcertou is not a function`

- [ ] **Step 3: Implementar em `src/game.js`**

Acrescentar depois de `comprarDica`:

```js
function abrirVotacao(jogo, origem, eleitores) {
  const r = exigirRodada(jogo, 'emAndamento');
  // Sem plateia conectada, ou com a votação desligada, o apresentador segue
  // sendo a única autoridade — é o caso do duelo x1.
  if (!jogo.config.plateia.votacao) return null;
  if (!eleitores || eleitores.length === 0) return null;
  r.fase = 'votacao';
  r.votacao = { origem, eleitores: [...eleitores], votos: {} };
  return r.votacao;
}

function adivinhadorAcertou(jogo, jogadorId, eleitores = []) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.adivinhadorId) throw new Error('Só o adivinhador avisa que acertou');
  return abrirVotacao(jogo, 'adivinhador', eleitores);
}

function fecharVotacao(jogo, aprovada) {
  const r = jogo.rodada;
  const { origem } = r.votacao;
  r.votacao = null;
  if (aprovada) {
    encerrarRodada(jogo, valorAtual(jogo));
    return { aprovada: true, origem };
  }
  if (origem === 'tempo') {
    encerrarRodada(jogo, 0);
    return { aprovada: false, origem };
  }
  r.fase = 'emAndamento';
  return { aprovada: false, origem };
}

function aprovouAcerto(votacao) {
  const sim = Object.values(votacao.votos).filter(Boolean).length;
  return sim * 2 > votacao.eleitores.length; // mais de 50%, empate não passa
}

function votar(jogo, jogadorNum, acertouMesmo) {
  const r = exigirRodada(jogo, 'votacao');
  if (!r.votacao.eleitores.includes(jogadorNum)) throw new Error('Você não vota nesta rodada');
  r.votacao.votos[jogadorNum] = Boolean(acertouMesmo);
  if (aprovouAcerto(r.votacao)) return fecharVotacao(jogo, true);
  if (Object.keys(r.votacao.votos).length >= r.votacao.eleitores.length) {
    return fecharVotacao(jogo, false);
  }
  return null;
}

function fecharVotacaoPorPrazo(jogo) {
  const r = exigirRodada(jogo, 'votacao');
  return fecharVotacao(jogo, aprovouAcerto(r.votacao));
}
```

Substituir `acertou` e `tempoEsgotado` por:

```js
function acertou(jogo, jogadorId) {
  const r = jogo.rodada;
  // Vale em andamento e durante a votação: o apresentador que acorda no meio
  // da votação resolve na hora, sem esperar a plateia.
  if (jogo.fase !== 'rodada' || !r || !['emAndamento', 'votacao'].includes(r.fase)) {
    throw new Error('Ação inválida nesta fase do jogo');
  }
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador confirma o acerto');
  r.votacao = null;
  encerrarRodada(jogo, valorAtual(jogo));
}

function tempoEsgotado(jogo, eleitores = []) {
  exigirRodada(jogo, 'emAndamento');
  if (abrirVotacao(jogo, 'tempo', eleitores)) return { votacao: true };
  encerrarRodada(jogo, 0);
  return { votacao: false };
}
```

Acrescentar ao `module.exports`: `adivinhadorAcertou,`, `votar,`, `fecharVotacaoPorPrazo,`.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — o teste antigo `passar e tempoEsgotado encerram com 0 pontos` chama `tempoEsgotado(jogo)` sem eleitores e continua cravando 0

- [ ] **Step 5: Commit**

```bash
git add src/game.js test/game.test.js
git commit -m "Plateia vota para confirmar o acerto quando o apresentador esquece"
```

---

### Task 7: Palpite e roubo da plateia

**Files:**
- Modify: `src/game.js` (novo `palpitar`, `module.exports`)
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: `pareceCerto` (Task 1), `jogo.config.plateia` (Task 2), `r.roubos`/`r.duplasQueRoubaram` (Task 4), `valorAtual` (Task 5)
- Produces:
  - `palpitar(jogo, jogadorId, texto) => { certo, roubo?, bonus?, nome?, repetido? }`
    - errado: `{ certo: false }`
    - certo e inédito para a dupla: `{ certo: true, roubo: number, bonus: number, nome: string, repetido: false }`
    - certo mas a dupla já roubou: `{ certo: true, roubo: 0, bonus: 0, repetido: true }`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/game.test.js`:

```js
test('palpite errado da plateia não mexe no pote', () => {
  const jogo = jogoCom3Duplas();
  const r = game.palpitar(jogo, 'c', 'Aquarela');
  assert.deepStrictEqual(r, { certo: false });
  assert.strictEqual(game.valorAtual(jogo), 100);
});

test('palpite certo rouba a fração do pote e paga metade à dupla', () => {
  const jogo = jogoCom3Duplas(); // música "Musica Numero 0"
  const r = game.palpitar(jogo, 'c', 'musica numero 0');
  assert.strictEqual(r.certo, true);
  assert.strictEqual(r.roubo, 5); // round(100 × 0.05)
  assert.strictEqual(r.bonus, 3); // round(5 × 0.5)
  assert.strictEqual(r.nome, 'Bia');
  assert.strictEqual(game.valorAtual(jogo), 95);
  assert.strictEqual(jogo.duplas[2].pontos, 3);
});

test('a mesma dupla só rouba uma vez por rodada', () => {
  const jogo = jogoCom3Duplas();
  game.palpitar(jogo, 'c', 'Musica Numero 0'); // Bia, dupla 2
  const r = game.palpitar(jogo, 'd', 'Musica Numero 0'); // Leo, mesma dupla 2
  assert.deepStrictEqual(r, { certo: true, roubo: 0, bonus: 0, repetido: true });
  assert.strictEqual(game.valorAtual(jogo), 95);
  assert.strictEqual(jogo.duplas[2].pontos, 3);
});

test('duplas diferentes roubam em sequência sobre o pote que resta', () => {
  const jogo = jogoCom3Duplas();
  const primeiro = game.palpitar(jogo, 'c', 'Musica Numero 0'); // dupla 2: 100 → 95
  const segundo = game.palpitar(jogo, 'e', 'Musica Numero 0'); // dupla 3: 95 → 90
  assert.strictEqual(primeiro.roubo, 5);
  assert.strictEqual(segundo.roubo, 5); // round(95 × 0.05) = 5
  assert.strictEqual(game.valorAtual(jogo), 90);
  assert.strictEqual(jogo.duplas[3].pontos, 3);
});

test('quem está jogando a rodada não palpita', () => {
  const jogo = jogoCom3Duplas();
  assert.throws(() => game.palpitar(jogo, 'a', 'Musica Numero 0'), /não palpita/);
  assert.throws(() => game.palpitar(jogo, 'b', 'Musica Numero 0'), /não palpita/);
});

test('palpite vazio e palpite com a mecânica desligada são recusados', () => {
  const jogo = jogoCom3Duplas();
  assert.throws(() => game.palpitar(jogo, 'c', '   '), /vazio/);
  jogo.config.plateia.palpite = false;
  assert.throws(() => game.palpitar(jogo, 'c', 'Musica Numero 0'), /desligado/);
});

test('x1 não tem plateia para palpitar', () => {
  const jogo = jogoX1();
  game.comecarRodada(jogo, 'a');
  assert.throws(() => game.palpitar(jogo, 'a', 'Musica Numero 0'), /Sem plateia/);
});

test('o roubo tolera acento, pontuação e dedo gordo', () => {
  const jogo = jogoCom3Duplas();
  assert.strictEqual(game.palpitar(jogo, 'c', 'MÚSICA NÚMERO 0!!').certo, true);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/game.test.js`
Expected: FAIL — `game.palpitar is not a function`

- [ ] **Step 3: Implementar em `src/game.js`**

No topo, ao lado dos outros `require`:

```js
const { pareceCerto } = require('./texto');
```

Acrescentar depois de `comprarDica`:

```js
function palpitar(jogo, jogadorId, texto) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (!jogo.config.plateia.palpite) throw new Error('O palpite da plateia está desligado nesta sala');
  if (jogo.modo !== 'duplas') throw new Error('Sem plateia neste modo');
  if (jogadorId === r.apresentadorId || jogadorId === r.adivinhadorId) {
    throw new Error('Quem está jogando a rodada não palpita');
  }
  const jogador = jogo.jogadores.find((j) => j.id === jogadorId);
  if (!jogador) throw new Error('Jogador não encontrado');
  if (!texto || !String(texto).trim()) throw new Error('Palpite vazio');
  if (!pareceCerto(texto, r.musica.titulo)) return { certo: false };
  // Uma dupla só rouba uma vez por rodada: sem isso, dois membros da mesma
  // dupla drenariam o pote em sequência.
  if (r.duplasQueRoubaram.includes(jogador.dupla)) {
    return { certo: true, roubo: 0, bonus: 0, repetido: true };
  }
  const valor = Math.max(1, Math.round(valorAtual(jogo) * jogo.config.plateia.rouboFracao));
  const bonus = Math.round(valor * jogo.config.plateia.bonusFracao);
  r.roubos.push({ num: jogador.num, dupla: jogador.dupla, valor });
  r.duplasQueRoubaram.push(jogador.dupla);
  if (jogo.duplas[jogador.dupla]) jogo.duplas[jogador.dupla].pontos += bonus;
  return { certo: true, roubo: valor, bonus, nome: jogador.nome, repetido: false };
}
```

Acrescentar `palpitar,` ao `module.exports`.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game.js test/game.test.js
git commit -m "Plateia palpita e rouba uma fração do pote, um roubo por dupla"
```

---

### Task 8: Líder da sala e configuração via socket

**Files:**
- Modify: `src/server.js` (`criarSala`, `entrar`, `disconnect`, `removerJogador`, `reiniciarSala`, `exigirDono` → `exigirLider`, `estadoPublico`, `estadoPrivado`, novo `configurarSala`)
- Test: `test/server.test.js` (reescrever o teste `só o dono inicia a partida...`; acrescentar testes novos)

**Interfaces:**
- Consumes: `mesclarPadroes`/`aplicarKnobs` (Task 2)
- Produces:
  - `sala.liderId` e `sala.config`
  - socket `configurarSala(knobs)` — só líder, só no lobby
  - `estadoPublico(sala)` ganha `liderNum: number | null` e `configSala: { duracaoSegundos, totalRodadas, maxDuplas, trocaMusica, trocaCusto, palpitePlateia, rouboFracao, votacaoPlateia }`
  - `estadoPrivado(sala, playerId)` passa a devolver objeto **também no lobby**: `{ num, ehLider, papel: 'lobby' }`; em rodada acrescenta `papel` + campos de sempre. Devolve `null` só quando o `playerId` não é jogador da sala.
  - eventos novos no monitor: `liderDefinido`, `salaConfigurada`

- [ ] **Step 1: Escrever os testes que falham**

Em `test/server.test.js`, **substituir** o teste `'só o dono inicia a partida, remove jogador e reinicia a sala'` por:

```js
test('só o líder inicia a partida, remove jogador, reinicia e configura', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const lider = conectar(url);
  const outro = conectar(url);
  try {
    await emitir(lider, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(outro, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    for (const evento of ['iniciarPartida', 'removerJogador', 'reiniciarSala', 'configurarSala']) {
      const erro = esperarErro(outro);
      outro.emit(evento, 1);
      assert.match(await erro, /líder da sala/);
    }
    // O display virou espectador: também não manda mais na sala.
    const erroDisplay = esperarErro(display);
    display.emit('iniciarPartida');
    assert.match(await erroDisplay, /líder da sala/);
  } finally { lider.close(); outro.close(); display.close(); httpServer.close(); }
});

test('o primeiro a entrar é o líder e aparece no estado', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    const r1 = await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    assert.strictEqual(r1.estado.liderNum, 1);
    assert.strictEqual(r1.estado.voce.ehLider, true);
    const r2 = await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    assert.strictEqual(r2.estado.liderNum, 1);
    assert.strictEqual(r2.estado.voce.ehLider, false);
  } finally { ana.close(); joao.close(); display.close(); httpServer.close(); }
});

test('líder que cai é sucedido pelo jogador conectado mais antigo', async () => {
  const { httpServer, url } = await subirServidor({ lobbyLimpezaMs: 60000 });
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    ana.close();
    const e = await esperarEstado(joao, (est) => est.liderNum === 2);
    assert.strictEqual(e.liderNum, 2);
    assert.strictEqual(e.voce.ehLider, true);
  } finally { joao.close(); display.close(); httpServer.close(); }
});

test('o líder não pode se expulsar', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  try {
    const r = await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const erro = esperarErro(ana);
    ana.emit('removerJogador', r.estado.jogadores[0].num);
    assert.match(await erro, /não pode se expulsar/);
  } finally { ana.close(); display.close(); httpServer.close(); }
});

test('configurarSala aplica knobs, satura faixa e sobrevive ao reinício', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    ana.emit('configurarSala', { duracaoSegundos: 30, totalRodadas: 999, maxDuplas: 8, palpitePlateia: false });
    const e = await esperarEstado(display, (est) => est.configSala.duracaoSegundos === 30);
    assert.strictEqual(e.configSala.totalRodadas, 20); // saturado
    assert.strictEqual(e.configSala.maxDuplas, 8);
    assert.strictEqual(e.configSala.palpitePlateia, false);
    assert.strictEqual(e.duracaoSegundos, 30);
    assert.strictEqual(e.totalRodadas, 20);
    ana.emit('reiniciarSala');
    const depois = await esperarEstado(display, (est) => est.jogadores.length === 0);
    assert.strictEqual(depois.configSala.duracaoSegundos, 30); // config persiste
    assert.strictEqual(depois.liderNum, null);
  } finally { ana.close(); display.close(); httpServer.close(); }
});

test('maxDuplas configurado libera a dupla 8', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const bia = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const recusada = await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 8 });
    assert.match(recusada.erro, /Dupla inválida/);
    ana.emit('configurarSala', { maxDuplas: 8 });
    await esperarEstado(ana, (est) => est.configSala.maxDuplas === 8);
    const aceita = await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 8 });
    assert.strictEqual(aceita.estado.jogadores.length, 2);
  } finally { ana.close(); bia.close(); display.close(); httpServer.close(); }
});
```

Nos testes existentes que usam `display.emit('iniciarPartida')`, `display.emit('removerJogador', ...)` e `display.emit('reiniciarSala')` — `'uma rodada completa via sockets, com sala'`, `'removerJogador (dono) tira o jogador e avisa o removido'`, `'reiniciarSala (dono) zera a partida...'`, `'duelo x1 via sockets...'` e `'fluxo de partida registra a sequência de eventos do jogo'` — trocar o emissor pelo socket do **primeiro jogador que entrou** (o líder). No teste de `removerJogador`, entrar com dois jogadores e o líder remove o segundo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/server.test.js`
Expected: FAIL — `liderNum` é `undefined`, `configurarSala` não existe, e o display ainda inicia a partida

- [ ] **Step 3: Implementar em `src/server.js`**

Adicionar o require no topo:

```js
const { mesclarPadroes, aplicarKnobs } = require('./configSala');
```

Em `criarSala`, guardar a config da sala e o líder:

```js
  function criarSala() {
    const configSala = mesclarPadroes(config);
    const sala = {
      codigo: gerarCodigo(),
      donoToken: crypto.randomUUID(), // identidade da TV, não dá mais poderes
      config: configSala,
      liderId: null,
      jogo: game.criarJogo(configSala, banco.ler(), rng),
      conectados: new Map(),
      limpezaLobby: new Map(),
      socketsNaSala: new Set(),
      timer: null,
      tempoRestante: null,
      timeoutProxima: null,
      timeoutExpiracao: null,
    };
    salas.set(sala.codigo, sala);
    registrador.registrar('salaCriada', { sala: sala.codigo });
    return sala;
  }
```

Acrescentar a promoção de líder perto de `nomeDe`/`numDe`:

```js
  function promoverLider(sala) {
    const antigo = sala.liderId;
    const candidato = sala.jogo.jogadores
      .filter((j) => sala.conectados.has(j.id))
      .sort((a, b) => a.num - b.num)[0];
    sala.liderId = candidato ? candidato.id : null;
    if (sala.liderId && sala.liderId !== antigo) {
      registrador.registrar('liderDefinido', {
        sala: sala.codigo, num: numDe(sala, sala.liderId), nome: nomeDe(sala, sala.liderId),
      });
    }
  }
```

Trocar todos os usos do `config` de closure por `sala.jogo.config`:
- `registrarFimSeAcabou`: `if (jogo.rodadasJogadas < jogo.config.rodada.totalRodadas) return;`
- `iniciarTimer`: `sala.tempoRestante = sala.jogo.config.rodada.duracaoSegundos;`
- `estadoPublico`: `totalRodadas: jogo.config.rodada.totalRodadas` e `duracaoSegundos: jogo.config.rodada.duracaoSegundos`
- `estadoPrivado`: `precos: game.dicasDisponiveis(sala.jogo.config, r.musica)`

Em `estadoPublico`, acrescentar ao objeto devolvido:

```js
      liderNum: sala.liderId ? numDe(sala, sala.liderId) : null,
      configSala: {
        duracaoSegundos: jogo.config.rodada.duracaoSegundos,
        totalRodadas: jogo.config.rodada.totalRodadas,
        maxDuplas: jogo.config.sala.maxDuplas,
        trocaMusica: jogo.config.troca.ligada,
        trocaCusto: jogo.config.troca.custo,
        palpitePlateia: jogo.config.plateia.palpite,
        rouboFracao: jogo.config.plateia.rouboFracao,
        votacaoPlateia: jogo.config.plateia.votacao,
      },
```

Substituir `estadoPrivado` inteiro (o front precisa saber quem é líder já no lobby, e antes essa função devolvia `null` sempre que não havia rodada):

```js
  function estadoPrivado(sala, playerId) {
    const jogador = sala.jogo.jogadores.find((j) => j.id === playerId);
    if (!jogador) return null;
    const base = { num: jogador.num, ehLider: playerId === sala.liderId };
    const r = sala.jogo.rodada;
    if (!r) return { ...base, papel: 'lobby' };
    if (playerId === r.apresentadorId) return { ...base, papel: 'apresentador', musica: r.musica };
    if (playerId === r.adivinhadorId) {
      return {
        ...base,
        papel: 'adivinhador',
        dicas: r.dicasCompradas,
        precos: game.dicasDisponiveis(sala.jogo.config, r.musica),
      };
    }
    return { ...base, papel: 'plateia' };
  }
```

Trocar `exigirDono` por `exigirLider`:

```js
    const exigirLider = () => {
      const sala = minhaSala();
      if (!sala || !pid() || pid() !== sala.liderId) {
        throw new Error('Só o líder da sala pode fazer isso');
      }
    };
```

Remover a linha `socket.data.ehDono = true;` do handler `criarSala` e trocar as três chamadas `exigirDono();` (em `iniciarPartida`, `removerJogador` e `reiniciarSala`) por `exigirLider();`.

No handler `entrar`, depois de `sala.conectados.set(...)`, definir o líder:

```js
        if (!sala.liderId) {
          sala.liderId = socket.data.playerId;
          registrador.registrar('liderDefinido', {
            sala: sala.codigo, num: numDe(sala, sala.liderId), nome: nomeDe(sala, sala.liderId),
          });
        }
```

No handler `removerJogador`, logo depois do `exigirLider()`, barrar a auto-expulsão:

```js
      if (sala.jogo.jogadores.find((j) => j.num === Number(num) && j.id === pid())) {
        throw new Error('O líder não pode se expulsar da sala');
      }
```

No handler `reiniciarSala`, preservar a config e zerar o líder — trocar a linha `sala.jogo = game.criarJogo(config, banco.ler(), rng);` por:

```js
      sala.jogo = game.criarJogo(sala.config, banco.ler(), rng);
      sala.liderId = null;
```

Acrescentar o handler novo, depois de `reiniciarSala`:

```js
    socket.on('configurarSala', (knobs) => guardar((sala) => {
      exigirLider();
      if (sala.jogo.fase !== 'lobby') throw new Error('Só dá para configurar a sala no lobby');
      sala.config = aplicarKnobs(sala.config, knobs);
      sala.jogo.config = sala.config;
      registrador.registrar('salaConfigurada', { sala: sala.codigo, knobs });
    }));
```

No `disconnect`, depois de `sala.conectados.delete(pid())`, promover:

```js
        if (pid() === sala.liderId) promoverLider(sala);
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — inclusive os testes existentes ajustados para emitir pelo líder

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "Líder da sala substitui o dono-display e configura a partida"
```

---

### Task 9: Fiação das ações novas no servidor

**Files:**
- Modify: `src/server.js` (timer pausável, `eleitoresDe`, handlers `trocarMusica`, `euAcertei`, `votar`, `palpitar`; timeout da votação)
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `trocarMusica` (Task 5), `adivinhadorAcertou`/`votar`/`fecharVotacaoPorPrazo` (Task 6), `palpitar` (Task 7), líder e config (Task 8)
- Produces:
  - sockets: `trocarMusica`, `euAcertei`, `votar(acertou: boolean)`, `palpitar(texto: string)`
  - emissão `roubo` para a sala: `{ nome: string, valor: number }`; emissão `avisoAcerto` só para o apresentador: `nome: string`
  - `estadoPublico(sala).rodada` ganha `votacao: { origem, eleitores, sim, votaram } | null` e `roubos: Array<{ num, valor }>`
  - `estadoPrivado` do apresentador ganha `podeTrocar: boolean`
  - eventos no monitor: `musicaTrocada`, `votacaoAberta`, `votacaoResolvida`, `plateiaRoubou`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/server.test.js` (antes do bloco de sugestões):

```js
test('trocar música pelo socket desconta e troca o título do apresentador', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  const bia = conectar(url);
  const leo = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(ana, (e) => e.rodada.fase === 'emAndamento');
    ana.emit('trocarMusica');
    const e = await esperarEstado(ana, (est) => est.rodada.valorAtual === 80);
    assert.notStrictEqual(e.voce.musica.titulo, 'Musica Numero 0');
  } finally {
    for (const c of [ana, joao, bia, leo, display]) c.close();
    httpServer.close();
  }
});

test('palpite certo da plateia rouba pontos e anuncia sem o título', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  const bia = conectar(url);
  const leo = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(bia, (e) => e.rodada.fase === 'emAndamento');
    const anuncio = new Promise((resolve) => display.on('roubo', resolve));
    bia.emit('palpitar', 'musica numero 0');
    const evento = await anuncio;
    assert.strictEqual(evento.nome, 'Bia');
    assert.strictEqual(evento.valor, 5);
    assert.ok(!('titulo' in evento), 'o anúncio não pode revelar o título');
    const e = await esperarEstado(display, (est) => est.rodada.valorAtual === 95);
    assert.strictEqual(e.duplas.find((d) => d.numero === 2).pontos, 3);
  } finally {
    for (const c of [ana, joao, bia, leo, display]) c.close();
    httpServer.close();
  }
});

test('palpite em rajada é barrado pelo intervalo mínimo', async () => {
  const configRapido = { ...CONFIG, plateia: { palpite: true, rouboFracao: 0.05, bonusFracao: 0.5, votacao: true, votacaoSegundos: 10, palpiteIntervaloMs: 5000 } };
  const { httpServer } = criarServidor({ config: configRapido, banco: bancoFalso, rng: () => 0 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  const bia = conectar(url);
  const leo = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(bia, (e) => e.rodada.fase === 'emAndamento');
    bia.emit('palpitar', 'nada a ver');
    const erro = esperarErro(bia);
    bia.emit('palpitar', 'outra coisa');
    assert.match(await erro, /Espere um pouco/);
  } finally {
    for (const c of [ana, joao, bia, leo, display]) c.close();
    httpServer.close();
  }
});

test('"eu acertei" abre votação, a plateia aprova e o timer pausa', async () => {
  const { httpServer, url } = await subirServidor({ resultadoMs: 30 });
  const { display, codigo } = await novaSala(url);
  const clientes = Array.from({ length: 6 }, () => conectar(url));
  const [ana, joao, bia, leo, carol, gui] = clientes;
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    await emitir(carol, 'entrar', { sala: codigo, nome: 'Carol', dupla: 3 });
    await emitir(gui, 'entrar', { sala: codigo, nome: 'Gui', dupla: 3 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada.fase === 'emAndamento');
    joao.emit('euAcertei');
    const emVotacao = await esperarEstado(display, (e) => e.rodada.fase === 'votacao');
    assert.strictEqual(emVotacao.rodada.votacao.origem, 'adivinhador');
    assert.strictEqual(emVotacao.rodada.votacao.eleitores.length, 4);
    bia.emit('votar', true);
    leo.emit('votar', true);
    carol.emit('votar', true);
    const fim = await esperarEstado(display, (e) => e.rodada.fase === 'resultado');
    assert.strictEqual(fim.rodada.pontosGanhos, 100);
  } finally {
    for (const c of clientes) c.close();
    display.close();
    httpServer.close();
  }
});

test('votação reprovada devolve a rodada ao andamento com o tempo de onde parou', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const clientes = Array.from({ length: 6 }, () => conectar(url));
  const [ana, joao, bia, leo, carol, gui] = clientes;
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    await emitir(carol, 'entrar', { sala: codigo, nome: 'Carol', dupla: 3 });
    await emitir(gui, 'entrar', { sala: codigo, nome: 'Gui', dupla: 3 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada.fase === 'emAndamento');
    joao.emit('euAcertei');
    await esperarEstado(display, (e) => e.rodada.fase === 'votacao');
    for (const c of [bia, leo, carol, gui]) c.emit('votar', false);
    const volta = await esperarEstado(display, (e) => e.rodada.fase === 'emAndamento');
    assert.ok(volta.tempoRestante > 0 && volta.tempoRestante <= 90);
  } finally {
    for (const c of clientes) c.close();
    display.close();
    httpServer.close();
  }
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/server.test.js`
Expected: FAIL — os sockets `trocarMusica`, `palpitar`, `euAcertei` e `votar` não existem

- [ ] **Step 3: Tornar o timer pausável em `src/server.js`**

Substituir `iniciarTimer` por três funções (o corpo do intervalo passa a ser reaproveitado pela retomada, e o `tempoEsgotado` agora recebe os eleitores):

```js
  function ligarTimer(sala) {
    if (sala.timer) return;
    sala.timer = setInterval(() => {
      sala.tempoRestante -= 1;
      io.to(`sala:${sala.codigo}`).emit('tick', sala.tempoRestante);
      if (sala.tempoRestante > 0) return;
      pararTimer(sala);
      const { jogo } = sala;
      if (jogo.fase !== 'rodada' || !jogo.rodada || jogo.rodada.fase !== 'emAndamento') return;
      const r = game.tempoEsgotado(jogo, eleitoresDe(sala));
      registrador.registrar('tempoEsgotado', {
        sala: sala.codigo, rodada: jogo.rodada.numero, musica: jogo.rodada.musica.titulo,
      });
      if (r.votacao) {
        agendarPrazoVotacao(sala);
      } else {
        agendarProxima(sala);
        registrarFimSeAcabou(sala);
      }
      broadcast(sala);
    }, 1000);
    sala.timer.unref();
  }

  function iniciarTimer(sala) {
    sala.tempoRestante = sala.jogo.config.rodada.duracaoSegundos;
    io.to(`sala:${sala.codigo}`).emit('tick', sala.tempoRestante);
    ligarTimer(sala);
  }

  function retomarTimer(sala) {
    if (sala.tempoRestante == null || sala.tempoRestante <= 0) return;
    ligarTimer(sala);
  }
```

- [ ] **Step 4: Acrescentar eleitores, prazo da votação e resolução**

Perto de `promoverLider`, acrescentar:

```js
  function eleitoresDe(sala) {
    const r = sala.jogo.rodada;
    if (!r) return [];
    return sala.jogo.jogadores
      .filter((j) => j.id !== r.apresentadorId && j.id !== r.adivinhadorId)
      .filter((j) => sala.conectados.has(j.id))
      .map((j) => j.num);
  }

  function pararPrazoVotacao(sala) {
    if (sala.timeoutVotacao) clearTimeout(sala.timeoutVotacao);
    sala.timeoutVotacao = null;
  }

  function agendarPrazoVotacao(sala) {
    pararPrazoVotacao(sala);
    registrador.registrar('votacaoAberta', {
      sala: sala.codigo,
      rodada: sala.jogo.rodada.numero,
      origem: sala.jogo.rodada.votacao.origem,
      eleitores: sala.jogo.rodada.votacao.eleitores.length,
    });
    sala.timeoutVotacao = setTimeout(() => {
      sala.timeoutVotacao = null;
      const { jogo } = sala;
      if (jogo.fase !== 'rodada' || !jogo.rodada || jogo.rodada.fase !== 'votacao') return;
      concluirVotacao(sala, game.fecharVotacaoPorPrazo(jogo));
      broadcast(sala);
    }, sala.jogo.config.plateia.votacaoSegundos * 1000);
    sala.timeoutVotacao.unref();
  }

  // Resultado da votação, venha do voto que bateu o quórum ou do prazo.
  function concluirVotacao(sala, resultado) {
    if (!resultado) return; // votação segue aberta
    pararPrazoVotacao(sala);
    registrador.registrar('votacaoResolvida', {
      sala: sala.codigo, rodada: sala.jogo.rodada.numero,
      origem: resultado.origem, aprovada: resultado.aprovada,
    });
    if (resultado.aprovada || resultado.origem === 'tempo') {
      pararTimer(sala);
      agendarProxima(sala);
      registrarFimSeAcabou(sala);
      return;
    }
    retomarTimer(sala); // "eu acertei" reprovado: a rodada continua de onde parou
  }
```

Acrescentar `sala.timeoutVotacao = null;` ao objeto criado em `criarSala`, e `pararPrazoVotacao(sala);` dentro de `destruirSala` e de `reiniciarSala`.

- [ ] **Step 5: Acrescentar os handlers de socket**

Depois do handler `passar`:

```js
    socket.on('trocarMusica', () => guardar((sala) => {
      const nova = game.trocarMusica(sala.jogo, pid());
      registrador.registrar('musicaTrocada', {
        sala: sala.codigo, rodada: sala.jogo.rodada.numero, musica: nova.titulo,
      });
    }));

    socket.on('euAcertei', () => guardar((sala) => {
      const votacao = game.adivinhadorAcertou(sala.jogo, pid(), eleitoresDe(sala));
      if (votacao) {
        pararTimer(sala); // o relógio pausa enquanto a plateia decide
        agendarPrazoVotacao(sala);
        return;
      }
      // Sem plateia (ou votação desligada): vira só um toque no apresentador.
      const socketApresentador = sala.conectados.get(sala.jogo.rodada.apresentadorId);
      const s = socketApresentador && io.of('/').sockets.get(socketApresentador);
      if (s) s.emit('avisoAcerto', nomeDe(sala, pid()));
    }));

    socket.on('votar', (acertou) => guardar((sala) => {
      const jogador = sala.jogo.jogadores.find((j) => j.id === pid());
      if (!jogador) throw new Error('Você não está nesta partida');
      concluirVotacao(sala, game.votar(sala.jogo, jogador.num, acertou));
    }));

    socket.on('palpitar', (texto) => guardar((sala) => {
      const agora = Date.now();
      const intervalo = sala.jogo.config.plateia.palpiteIntervaloMs;
      if (socket.data.ultimoPalpite && agora - socket.data.ultimoPalpite < intervalo) {
        throw new Error('Espere um pouco antes do próximo palpite');
      }
      socket.data.ultimoPalpite = agora;
      const r = game.palpitar(sala.jogo, pid(), texto);
      if (!r.certo) throw new Error('Não foi dessa vez — tente outro palpite');
      if (r.repetido) throw new Error('Sua dupla já roubou nesta rodada');
      // O anúncio não leva o título: a plateia não pode soprar a resposta.
      io.to(`sala:${sala.codigo}`).emit('roubo', { nome: r.nome, valor: r.roubo });
      registrador.registrar('plateiaRoubou', {
        sala: sala.codigo, rodada: sala.jogo.rodada.numero,
        nome: r.nome, valor: r.roubo, bonus: r.bonus,
      });
    }));
```

Em `estadoPrivado`, no ramo do apresentador, entregar mastigado se ele ainda pode trocar — assim o front não precisa conhecer `porRodada`:

```js
    if (playerId === r.apresentadorId) {
      return {
        ...base,
        papel: 'apresentador',
        musica: r.musica,
        podeTrocar: sala.jogo.config.troca.ligada
          && r.fase === 'emAndamento'
          && r.trocasUsadas < sala.jogo.config.troca.porRodada,
      };
    }
```

No `estadoPublico`, dentro do objeto `rodada`, acrescentar a votação para que a TV e os celulares possam desenhá-la:

```js
        votacao: r.votacao && {
          origem: r.votacao.origem,
          eleitores: r.votacao.eleitores,
          sim: Object.values(r.votacao.votos).filter(Boolean).length,
          votaram: Object.keys(r.votacao.votos).length,
        },
        roubos: r.roubos.map((x) => ({ num: x.num, valor: x.valor })),
```

No handler `acertou`, acrescentar `pararPrazoVotacao(sala);` logo depois de `game.acertou(...)`, porque o apresentador pode resolver com a votação aberta.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "Sockets de troca, votação e palpite, com timer pausável na votação"
```

---

### Task 10: Display vira espectador

**Files:**
- Modify: `public/display/index.html`, `public/display/app.js`, `public/shared/neoretro.css`

**Interfaces:**
- Consumes: `estado.liderNum`, `estado.configSala`, `estado.rodada.votacao`, evento `roubo` (Tasks 8 e 9)
- Produces: nenhuma API — só interface

- [ ] **Step 1: Tirar os botões de controle do HTML**

Em `public/display/index.html`:
- remover a linha do `<button id="btn-reiniciar" ...>` (linha 86)
- remover a linha do `<button id="btn-iniciar" ...>` (linha 96)
- acrescentar, logo depois de `<div id="lobby-duplas"></div>`, o aviso de quem manda:

```html
      <p id="lider-aviso" class="pill">Aguardando o primeiro jogador entrar…</p>
```

- acrescentar, dentro de `<section id="tela-rodada" ...>` logo depois do `<span id="valor" class="pill valor"></span>`, o painel da votação:

```html
      <div id="painel-votacao" class="card oculto" style="text-align:center">
        <h2 id="votacao-titulo"></h2>
        <p id="votacao-contagem" style="font-size:1.6rem;font-weight:800"></p>
      </div>
```

- [ ] **Step 2: Ajustar o `public/display/app.js`**

Remover os handlers `$('btn-iniciar').onclick` e `$('btn-reiniciar').onclick` (linhas 40-45).

Em `renderLobbyDuplas`, trocar a lista fixa `[1, 2, 3, 4]` por uma derivada da config, e tirar o botão de remover (agora é o líder quem expulsa, pelo celular):

```js
function renderLobbyDuplas(e) {
  const maxDuplas = e.configSala ? e.configSala.maxDuplas : 4;
  const porDupla = Array.from({ length: maxDuplas }, (_, i) => i + 1).map((n) => {
    const membros = e.jogadores.filter((j) => j.dupla === n);
    if (!membros.length) return '';
    const itens = membros.map((j) =>
      `<div class="card-jogador ${j.conectado ? '' : 'off'}" data-num="${j.num}"
            style="animation-delay:${(j.num % 7) * 0.4}s">
        <span class="mini-avatar">${DesafinoAvatar.avatarSvg(j.avatar)}</span>
        <span class="nome-jogador">${j.conectado ? '' : '🔴 '}${esc(j.nome)}</span>
        ${j.num === e.liderNum ? '<span class="coroa" title="Líder da sala">👑</span>' : ''}
      </div>`
    ).join('');
    return `<div class="grupo-dupla"><b>Dupla ${n}</b><div class="fileira-avatares">${itens}</div></div>`;
  });
  $('lobby-duplas').innerHTML = porDupla.join('') || '<p>Aguardando jogadores…</p>';
  const lider = e.jogadores.find((j) => j.num === e.liderNum);
  $('lider-aviso').textContent = lider
    ? `👑 ${lider.nome} comanda a sala pelo celular`
    : 'Aguardando o primeiro jogador entrar…';
}
```

No handler `socket.on('estado', ...)`, acrescentar a chamada do painel de votação logo antes de `renderRodada(e)` — trocar as últimas linhas por:

```js
  if (e.rodada.fase === 'resultado') return renderResultado(e);
  renderRodada(e);
  renderVotacao(e);
```

Acrescentar a função nova, depois de `renderRodada`:

```js
function renderVotacao(e) {
  const v = e.rodada.votacao;
  $('painel-votacao').classList.toggle('oculto', !v);
  if (!v) return;
  $('votacao-titulo').textContent = v.origem === 'tempo'
    ? '⏰ Tempo esgotado — a dupla acertou?'
    : '✋ O adivinhador diz que acertou!';
  $('votacao-contagem').textContent = `${v.sim} de ${v.eleitores.length} confirmaram · ${v.votaram} votaram`;
}
```

Acrescentar o anúncio do roubo, junto dos outros `socket.on`:

```js
socket.on('roubo', ({ nome, valor }) => mostrarEvento(`🔥 ${nome} roubou ${valor} pts da rodada!`));
```

- [ ] **Step 3: Estilo da coroa**

Acrescentar ao fim de `public/shared/neoretro.css`:

```css
.coroa { font-size: 1.2rem; margin-left: 4px; }
```

- [ ] **Step 4: Verificar no navegador**

Run: `npm start`
Abrir `http://localhost:3000/display/` e conferir: nenhum botão de iniciar ou reiniciar, aviso "Aguardando o primeiro jogador entrar…" no lobby. Entrar com um celular em `http://localhost:3000/jogar/` e confirmar que o aviso vira "👑 Nome comanda a sala pelo celular".

- [ ] **Step 5: Commit**

```bash
git add public/display/index.html public/display/app.js public/shared/neoretro.css
git commit -m "Display vira espectador: sem botões, com coroa do líder e painel de votação"
```

---

### Task 11: Celular ganha os controles

**Files:**
- Modify: `public/jogar/index.html`, `public/jogar/app.js`, `README.md`

**Interfaces:**
- Consumes: `estado.voce.ehLider`, `estado.voce.num`, `estado.voce.podeTrocar`, `estado.configSala`, `estado.rodada.votacao`, sockets `configurarSala`, `trocarMusica`, `euAcertei`, `votar`, `palpitar`, eventos `roubo` e `avisoAcerto` (Tasks 8 e 9)
- Produces: nenhuma API — só interface

- [ ] **Step 1: Acrescentar os blocos novos ao HTML**

Em `public/jogar/index.html`:

- no `<select id="campo-dupla">`, deixar as 10 duplas (o servidor recusa acima do limite da sala, com mensagem explicando até onde vai):

```html
      <select id="campo-dupla">
        <option value="1">Dupla 1</option>
        <option value="2">Dupla 2</option>
        <option value="3">Dupla 3</option>
        <option value="4">Dupla 4</option>
        <option value="5">Dupla 5</option>
        <option value="6">Dupla 6</option>
        <option value="7">Dupla 7</option>
        <option value="8">Dupla 8</option>
        <option value="9">Dupla 9</option>
        <option value="10">Dupla 10</option>
      </select>
```

- dentro de `<section id="tela-espera" ...>`, depois do `<div id="emotes" ...>`, o painel do líder:

```html
    <div id="painel-lider" class="card oculto" style="text-align:left;margin-top:16px">
      <h3>👑 Você comanda a sala</h3>
      <label>Duração da rodada <input id="cfg-duracao" type="number" min="30" max="180" step="15"></label>
      <label>Rodadas <input id="cfg-rodadas" type="number" min="4" max="20"></label>
      <label>Máximo de duplas <input id="cfg-duplas" type="number" min="1" max="10"></label>
      <label><input id="cfg-troca" type="checkbox"> Permitir trocar música</label>
      <label>Custo da troca <input id="cfg-troca-custo" type="number" min="0" max="50"></label>
      <label><input id="cfg-palpite" type="checkbox"> Plateia pode palpitar</label>
      <label><input id="cfg-votacao" type="checkbox"> Plateia vota o acerto</label>
      <button id="btn-salvar-config" class="btn btn-secondary" style="width:100%">Salvar configuração</button>
      <button id="btn-iniciar" class="btn btn-success" style="width:100%;margin-top:8px">▶ Começar partida</button>
      <button id="btn-reiniciar" class="btn btn-error" style="width:100%;margin-top:8px">↺ Reiniciar sala</button>
      <div id="lista-expulsar"></div>
    </div>
```

- dentro de `<section id="tela-apresentador" ...>`, depois do botão de mímica:

```html
    <button id="btn-trocar" class="btn btn-tertiary oculto" style="width:100%">🔀 Trocar música</button>
```

- dentro de `<section id="tela-adivinhador" ...>`, depois do `<div id="lista-dicas"></div>`:

```html
    <button id="btn-eu-acertei" class="btn btn-success" style="width:100%;margin-top:12px">✋ Eu acertei!</button>
```

- substituir a `<section id="tela-plateia" ...>` inteira por:

```html
  <section id="tela-plateia" class="tela card oculto" style="text-align:center">
    <h2>🍿 Você está na plateia</h2>
    <p>Adivinhou antes? Palpite e roube pontos da rodada.</p>
    <div class="linha-busca">
      <input id="campo-palpite" placeholder="Seu palpite…" autocomplete="off">
      <button id="btn-palpitar" class="btn btn-tertiary" style="padding:10px 16px">🔥</button>
    </div>
    <div id="painel-voto" class="oculto" style="margin-top:16px">
      <h3 id="voto-pergunta"></h3>
      <button id="btn-voto-sim" class="btn btn-success" style="width:100%">✅ Acertou</button>
      <button id="btn-voto-nao" class="btn btn-error" style="width:100%;margin-top:8px">❌ Não acertou</button>
    </div>
  </section>
```

- [ ] **Step 2: Ligar o painel do líder em `public/jogar/app.js`**

Acrescentar antes de `function render(e)`:

```js
const CAMPOS_CONFIG = [
  ['cfg-duracao', 'duracaoSegundos', 'number'],
  ['cfg-rodadas', 'totalRodadas', 'number'],
  ['cfg-duplas', 'maxDuplas', 'number'],
  ['cfg-troca', 'trocaMusica', 'check'],
  ['cfg-troca-custo', 'trocaCusto', 'number'],
  ['cfg-palpite', 'palpitePlateia', 'check'],
  ['cfg-votacao', 'votacaoPlateia', 'check'],
];

function renderPainelLider(e) {
  const ehLider = Boolean(e.voce && e.voce.ehLider) && e.fase === 'lobby';
  $('painel-lider').classList.toggle('oculto', !ehLider);
  if (!ehLider || !e.configSala) return;
  // Não sobrescreve o que o líder está digitando agora.
  for (const [id, chave, tipo] of CAMPOS_CONFIG) {
    if (document.activeElement === $(id)) continue;
    if (tipo === 'check') $(id).checked = e.configSala[chave];
    else $(id).value = e.configSala[chave];
  }
  $('lista-expulsar').innerHTML = e.jogadores
    .filter((j) => j.num !== e.voce.num)
    .map((j) => `<div class="dica"><span>${esc(j.nome)} (Dupla ${j.dupla})</span>
      <button class="btn btn-error" data-expulsar="${j.num}" style="padding:6px 12px">✕</button></div>`)
    .join('');
  for (const btn of $('lista-expulsar').querySelectorAll('button[data-expulsar]')) {
    btn.onclick = () => socket.emit('removerJogador', Number(btn.dataset.expulsar));
  }
}

$('btn-salvar-config').onclick = () => {
  const knobs = {};
  for (const [id, chave, tipo] of CAMPOS_CONFIG) {
    knobs[chave] = tipo === 'check' ? $(id).checked : Number($(id).value);
  }
  socket.emit('configurarSala', knobs);
};
$('btn-iniciar').onclick = () => socket.emit('iniciarPartida');
$('btn-reiniciar').onclick = () => {
  if (confirm('Reiniciar a sala? Todos os jogadores e pontos serão zerados.')) {
    socket.emit('reiniciarSala');
  }
};
```

Dentro de `render(e)`, no ramo do lobby, chamar o painel — trocar o bloco `if (e.fase === 'lobby') { ... }` por:

```js
  if (e.fase === 'lobby') {
    $('emotes').classList.toggle('oculto', !entrou);
    $('espera-titulo').textContent = 'Você está dentro!';
    $('espera-texto').textContent = 'Aguardando a partida começar…';
    renderPainelLider(e);
    return mostrarTela(e.voce || entrou ? 'tela-espera' : 'tela-entrar');
  }
  $('painel-lider').classList.add('oculto');
```

- [ ] **Step 3: Ligar troca, "eu acertei" e plateia**

Em `renderApresentador`, acrescentar ao fim (o servidor já decide se pode trocar, na Task 9):

```js
  $('btn-trocar').classList.toggle('oculto', !e.voce.podeTrocar);
  $('btn-trocar').textContent = `🔀 Trocar música (−${e.configSala.trocaCusto} pts)`;
```

Em `renderAdivinhador`, acrescentar ao fim:

```js
  $('btn-eu-acertei').classList.toggle('oculto', e.rodada.fase !== 'emAndamento');
```

Substituir a última linha de `render(e)` (`mostrarTela('tela-plateia');`) por:

```js
  renderPlateia(e);
```

E acrescentar, depois de `renderAdivinhador`:

```js
function renderPlateia(e) {
  mostrarTela('tela-plateia');
  const votando = e.rodada.fase === 'votacao';
  const souEleitor = votando && e.rodada.votacao.eleitores.includes(e.voce.num);
  $('campo-palpite').parentElement.classList.toggle('oculto', votando || !e.configSala.palpitePlateia);
  $('painel-voto').classList.toggle('oculto', !souEleitor);
  if (souEleitor) {
    $('voto-pergunta').textContent = e.rodada.votacao.origem === 'tempo'
      ? `⏰ Tempo esgotado — ${e.rodada.adivinhador} acertou?`
      : `✋ ${e.rodada.adivinhador} diz que acertou. Confere?`;
  }
}
```

Acrescentar os handlers, junto dos outros botões:

```js
$('btn-trocar').onclick = () => socket.emit('trocarMusica');
$('btn-eu-acertei').onclick = () => socket.emit('euAcertei');
$('btn-voto-sim').onclick = () => socket.emit('votar', true);
$('btn-voto-nao').onclick = () => socket.emit('votar', false);
$('btn-palpitar').onclick = () => {
  const texto = $('campo-palpite').value.trim();
  if (!texto) return;
  socket.emit('palpitar', texto);
  $('campo-palpite').value = '';
};
$('campo-palpite').onkeydown = (ev) => { if (ev.key === 'Enter') $('btn-palpitar').onclick(); };

socket.on('roubo', ({ nome, valor }) => mostrarErro(`🔥 ${nome} roubou ${valor} pts da rodada!`));
socket.on('avisoAcerto', (nome) => mostrarErro(`✋ ${nome} diz que acertou — confirme se for isso!`));
```

- [ ] **Step 4: Verificar no navegador**

Run: `npm start`

Abrir o display e quatro abas em `http://localhost:3000/jogar/`. Conferir, na ordem:
1. O primeiro celular a entrar mostra o painel 👑 com os campos preenchidos; os outros não.
2. Mudar "Máximo de duplas" para 8, salvar, e um celular novo consegue entrar na dupla 6.
3. Começar a partida pelo celular do líder.
4. O apresentador vê "🔀 Trocar música (−20 pts)"; depois de usar, o botão some.
5. Um celular da plateia palpita o título certo → todos veem "🔥 Nome roubou N pts".
6. O adivinhador aperta "✋ Eu acertei!" → a plateia recebe os botões de voto e o timer congela.

- [ ] **Step 5: Atualizar o README**

Em `README.md`, substituir os passos 2 a 7 da seção "Como jogar" por:

```markdown
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
```

Na seção "Balanceamento", substituir o parágrafo por:

```markdown
Os padrões ficam em `config.json` (duração, nº de rodadas, valores dos modos, preço das
dicas, limites da sala, custo da troca e regras da plateia). O líder ajusta a maior parte
disso na própria sala, pelo celular, sem reiniciar o servidor — e o ajuste sobrevive ao
"reiniciar sala". `bonusFracao`, `votacaoSegundos` e `palpiteIntervaloMs` só mudam no arquivo.
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/jogar/index.html public/jogar/app.js README.md
git commit -m "Celular do líder configura a sala; apresentador troca música e plateia palpita e vota"
```

---

## Notas de verificação final

Depois da Task 11, rodar uma partida completa de ponta a ponta com 6 celulares (3 duplas) e conferir os quatro caminhos que os testes não cobrem sozinhos:

1. **Sucessão real:** fechar a aba do líder no meio do lobby e ver a coroa migrar no display.
2. **Votação por tempo esgotado:** deixar o relógio zerar e confirmar que a plateia recebe a pergunta antes de cravar 0.
3. **Pote único:** comprar duas dicas, trocar a música, comprar de novo e conferir que o valor no display bate com `100 − dicas antigas − 20 − dicas novas`.
4. **Roubo com teto por dupla:** dois membros da mesma dupla palpitando certo — o segundo recebe "sua dupla já roubou nesta rodada" e o pote não muda.
