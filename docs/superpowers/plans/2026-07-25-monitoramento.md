# Monitoramento e Log de Eventos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel `/monitor` ao vivo (salas, jogadores, feed de eventos) protegido por token + log JSONL de eventos do jogo e de sockets em `data/eventos.jsonl`.

**Architecture:** Um módulo puro `src/eventos.js` (registrador com arquivo JSONL + ring buffer + assinantes) é injetado em `criarServidor`, que instrumenta os handlers existentes e retransmite cada evento para a room Socket.IO `monitor`. A página estática `public/monitor/` consome `GET /api/monitor?token=` (snapshot) e os eventos ao vivo. Token vem de `MONITOR_TOKEN` (env) ou é gerado no boot.

**Tech Stack:** Node ≥18 (sem deps novas), Express 4, Socket.IO 4, `node:test`, vanilla JS no front.

## Global Constraints

- Toda a UI e mensagens de erro em **pt-BR**.
- Zero dependências novas de produção (só `fs`, `crypto` nativos).
- Front no design neo-retrô existente: `<link rel="stylesheet" href="/shared/neoretro.css">`, mesmos padrões das páginas em `public/`.
- Nomes de jogador em `innerHTML` SEMPRE passam pelo helper `esc()` (padrão anti-XSS do projeto).
- Falha de escrita no log NUNCA derruba o jogo (só `console.error`).
- Testes com `npm test` (`node --test`); suite atual tem 56 testes passando — todos devem continuar passando.

---

### Task 1: Registrador de eventos (`src/eventos.js`)

**Files:**
- Create: `src/eventos.js`
- Test: `test/eventos.test.js`

**Interfaces:**
- Produces: `criarRegistrador({ arquivo = null, limiteMemoria = 300 } = {})` → `{ registrar(tipo, dados?), recentes(), aoRegistrar(fn) }`
  - `registrar` retorna o evento `{ ts: '<ISO>', tipo, ...dados }` e o acrescenta ao buffer/arquivo/assinantes.
  - `recentes()` → cópia do array dos últimos `limiteMemoria` eventos (mais antigo primeiro).
  - `aoRegistrar(fn)` → registra assinante chamado com cada evento novo.

- [ ] **Step 1: Escrever os testes que falham**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarRegistrador } = require('../src/eventos');

test('registrar devolve evento com ts ISO, tipo e dados', () => {
  const reg = criarRegistrador();
  const e = reg.registrar('jogadorEntrou', { sala: 'ABCD', nome: 'Bia' });
  assert.strictEqual(e.tipo, 'jogadorEntrou');
  assert.strictEqual(e.sala, 'ABCD');
  assert.strictEqual(e.nome, 'Bia');
  assert.ok(!Number.isNaN(Date.parse(e.ts)), 'ts deve ser data ISO válida');
});

test('recentes respeita o limite de memória (descarta os mais antigos)', () => {
  const reg = criarRegistrador({ limiteMemoria: 3 });
  for (let i = 1; i <= 5; i++) reg.registrar('e', { i });
  const is = reg.recentes().map((e) => e.i);
  assert.deepStrictEqual(is, [3, 4, 5]);
});

test('aoRegistrar notifica assinantes com o evento', () => {
  const reg = criarRegistrador();
  const vistos = [];
  reg.aoRegistrar((e) => vistos.push(e.tipo));
  reg.registrar('salaCriada', { sala: 'ABCD' });
  assert.deepStrictEqual(vistos, ['salaCriada']);
});

test('com arquivo, grava uma linha JSONL por evento', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desafino-ev-'));
  const arquivo = path.join(dir, 'eventos.jsonl');
  const reg = criarRegistrador({ arquivo });
  reg.registrar('salaCriada', { sala: 'ABCD' });
  reg.registrar('jogadorEntrou', { sala: 'ABCD', nome: 'Léo' });
  // appendFile é assíncrono: dá um tempinho pro flush
  await new Promise((r) => setTimeout(r, 100));
  const linhas = fs.readFileSync(arquivo, 'utf8').trim().split('\n');
  assert.strictEqual(linhas.length, 2);
  const segunda = JSON.parse(linhas[1]);
  assert.strictEqual(segunda.tipo, 'jogadorEntrou');
  assert.strictEqual(segunda.nome, 'Léo');
});

test('sem arquivo (null) não grava nada e não explode', () => {
  const reg = criarRegistrador({ arquivo: null });
  assert.doesNotThrow(() => reg.registrar('salaCriada', { sala: 'ABCD' }));
  assert.strictEqual(reg.recentes().length, 1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/eventos.test.js`
Expected: FAIL — `Cannot find module '../src/eventos'`

- [ ] **Step 3: Implementação mínima**

```js
'use strict';
const fs = require('fs');

// Registrador de eventos: linha JSONL em disco + ring buffer pro painel ao vivo.
function criarRegistrador({ arquivo = null, limiteMemoria = 300 } = {}) {
  const recentes = [];
  const assinantes = [];

  function registrar(tipo, dados = {}) {
    const evento = { ts: new Date().toISOString(), tipo, ...dados };
    recentes.push(evento);
    if (recentes.length > limiteMemoria) recentes.shift();
    if (arquivo) {
      fs.appendFile(arquivo, JSON.stringify(evento) + '\n', (err) => {
        if (err) console.error('Falha ao gravar evento:', err.message);
      });
    }
    for (const fn of assinantes) fn(evento);
    return evento;
  }

  return {
    registrar,
    recentes: () => [...recentes],
    aoRegistrar: (fn) => assinantes.push(fn),
  };
}

module.exports = { criarRegistrador };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/eventos.test.js`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/eventos.js test/eventos.test.js
git commit -m "Registrador de eventos: JSONL + ring buffer + assinantes"
```

---

### Task 2: Instrumentação do servidor + token + `/api/monitor`

**Files:**
- Modify: `src/server.js`
- Test: `test/server.test.js` (novos casos no final; reutilize os helpers existentes `subirServidor`/`novaSala`/`emitir`/`esperarEstado` — leia o topo do arquivo antes)

**Interfaces:**
- Consumes: `criarRegistrador` da Task 1.
- Produces (para as Tasks 3 e 4):
  - `criarServidor` aceita opções novas: `registrador` (padrão `criarRegistrador()` só-memória) e `monitorToken` (padrão `process.env.MONITOR_TOKEN || crypto.randomBytes(8).toString('hex')`).
  - Retorno de `criarServidor` ganha `monitorToken`.
  - `GET /api/monitor?token=` → 200 `{ salas, eventos }` ou 403 `{ erro: 'Token inválido' }`.
    - `salas`: `[{ codigo, fase, modoJogo, rodadaNumero, jogadores: [{num, nome, dupla, conectado}] }]`
    - `eventos`: `registrador.recentes()`
  - Socket: emitir `monitorar(token, cb)`; token certo → socket entra na room `monitor` e `cb({ ok: true })`; errado → `cb({ erro: 'Token inválido' })`.
  - Room `monitor` recebe `monitorEvento` (cada evento registrado) e `monitorSalas` (resumo a cada broadcast).

- [ ] **Step 1: Escrever os testes que falham** (adaptar chamadas aos helpers reais do arquivo)

```js
// ---- Monitoramento ----
// Suba o servidor passando as opções novas, ex.:
//   const registrador = criarRegistrador();
//   ...criarServidor({ config, banco, rng, resultadoMs: 50, registrador, monitorToken: 'segredo' })

test('GET /api/monitor exige token', async (t) => {
  // ... subirServidor com monitorToken: 'segredo'
  const sem = await fetch(`${base}/api/monitor`);
  assert.strictEqual(sem.status, 403);
  const errado = await fetch(`${base}/api/monitor?token=xxx`);
  assert.strictEqual(errado.status, 403);
});

test('GET /api/monitor com token devolve salas e eventos', async (t) => {
  // ... cria sala e entra 1 jogador (helpers existentes)
  const r = await fetch(`${base}/api/monitor?token=segredo`);
  assert.strictEqual(r.status, 200);
  const { salas, eventos } = await r.json();
  const sala = salas.find((s) => s.codigo === codigo);
  assert.ok(sala, 'sala aparece no snapshot');
  assert.strictEqual(sala.fase, 'lobby');
  assert.strictEqual(sala.jogadores.length, 1);
  assert.strictEqual(sala.jogadores[0].conectado, true);
  const tipos = eventos.map((e) => e.tipo);
  assert.ok(tipos.includes('salaCriada'));
  assert.ok(tipos.includes('jogadorEntrou'));
});

test('socket monitorar recebe monitorEvento e monitorSalas ao vivo', async (t) => {
  // monitor conecta e autentica
  const mon = ioClient(base);           // padrão dos helpers existentes
  const ok = await emitir(mon, 'monitorar', 'segredo');
  assert.deepStrictEqual(ok, { ok: true });
  const errado = await emitir(ioClient(base), 'monitorar', 'nope');
  assert.strictEqual(errado.erro, 'Token inválido');
  // um jogador entra → monitor vê o evento e o resumo novo
  const evento = new Promise((res) => mon.on('monitorEvento', (e) => {
    if (e.tipo === 'jogadorEntrou') res(e);
  }));
  const resumo = new Promise((res) => mon.on('monitorSalas', res));
  // ... jogador entra na sala via helper
  const e = await evento;
  assert.strictEqual(e.sala, codigo);
  const salas = await resumo;
  assert.ok(salas.find((s) => s.codigo === codigo));
});

test('fluxo de partida registra a sequência de eventos do jogo', async (t) => {
  const registrador = criarRegistrador();
  // ... sobe servidor com { registrador }, 2 jogadores na mesma dupla (modo x1),
  //     iniciarPartida → comecarRodada → comprarDica('decada') → acertou
  const tipos = registrador.recentes().map((e) => e.tipo);
  for (const esperado of ['salaCriada', 'socketConectado', 'jogadorEntrou',
    'partidaIniciada', 'rodadaComecou', 'dicaComprada', 'acertou']) {
    assert.ok(tipos.includes(esperado), `faltou evento ${esperado}: ${tipos}`);
  }
  const dica = registrador.recentes().find((e) => e.tipo === 'dicaComprada');
  assert.strictEqual(dica.dica, 'decada'); // o tipo da dica vai no campo `dica` (ver Step 3)
  assert.strictEqual(dica.custo, 5);
  const acerto = registrador.recentes().find((e) => e.tipo === 'acertou');
  assert.ok(acerto.pontos > 0);
});
```

Nota: o evento de dica usa o campo `dica` (não `tipo`) para o tipo da dica, porque `tipo` já é o nome do evento.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/server.test.js`
Expected: FAIL — 403/handlers inexistentes

- [ ] **Step 3: Implementar em `src/server.js`**

No topo: `const { criarRegistrador } = require('./eventos');`

Assinatura (linha ~26):

```js
function criarServidor({
  config, banco, rng = Math.random,
  resultadoMs = 6000, lobbyLimpezaMs = 30000, salaExpiraMs = 3600000,
  registrador = criarRegistrador(),
  monitorToken = process.env.MONITOR_TOKEN || crypto.randomBytes(8).toString('hex'),
}) {
```

Depois de criar `io`, retransmissão ao painel:

```js
registrador.aoRegistrar((evento) => io.to('monitor').emit('monitorEvento', evento));
```

Resumo das salas (perto de `estadoPublico`):

```js
function salasResumo() {
  return [...salas.values()].map((sala) => ({
    codigo: sala.codigo,
    fase: sala.jogo.fase,
    modoJogo: sala.jogo.modo,
    rodadaNumero: sala.jogo.rodada ? sala.jogo.rodada.numero : null,
    jogadores: sala.jogo.jogadores.map((j) => ({
      num: j.num, nome: j.nome, dupla: j.dupla, conectado: sala.conectados.has(j.id),
    })),
  }));
}
```

Em `broadcast(sala)`, última linha: `io.to('monitor').emit('monitorSalas', salasResumo());`

Rota REST (junto das outras):

```js
app.get('/api/monitor', (req, res) => {
  if (req.query.token !== monitorToken) return res.status(403).json({ erro: 'Token inválido' });
  res.json({ salas: salasResumo(), eventos: registrador.recentes() });
});
```

Handler do socket (dentro de `io.on('connection')`):

```js
socket.on('monitorar', (token, cb = () => {}) => {
  if (token !== monitorToken) return cb({ erro: 'Token inválido' });
  socket.join('monitor');
  cb({ ok: true });
});
```

Pontos de instrumentação (todos `registrador.registrar(...)`):

| Onde | Chamada |
|---|---|
| `criarSala()` antes do `return` | `registrar('salaCriada', { sala: sala.codigo })` |
| timeout de `agendarExpiracao`, antes de `destruirSala` | `registrar('salaExpirada', { sala: sala.codigo })` |
| `io.on('connection')` primeira linha | `registrar('socketConectado', { socketId: socket.id })` |
| handler `disconnect`, primeira linha | `const sala0 = minhaSala(); registrar('socketDesconectado', { socketId: socket.id, sala: socket.data.sala || null, nome: sala0 && pid() ? nomeDe(sala0, pid()) : undefined })` |
| `entrar`, após `sala.conectados.set(...)` | `registrar(existente ? 'jogadorReconectou' : 'jogadorEntrou', { sala: sala.codigo, num: numDe(sala, socket.data.playerId), nome: nomeDe(sala, socket.data.playerId), dupla: Number(dados.dupla) || undefined })` |
| `removerJogador`, após achar `alvo` (se existir) | `registrar('jogadorRemovido', { sala: sala.codigo, num: alvo.num, nome: alvo.nome })` |
| `reiniciarSala`, no fim | `registrar('salaReiniciada', { sala: sala.codigo })` |
| `iniciarPartida`, após `game.iniciarPartida` | `registrar('partidaIniciada', { sala: sala.codigo, modoJogo: sala.jogo.modo, jogadores: sala.jogo.jogadores.map((j) => j.nome) })` |
| `comecarRodada`, após `iniciarTimer` | `registrar('rodadaComecou', { sala: sala.codigo, rodada: r2.numero, modo: r2.modo, apresentador: nomeDe(sala, r2.apresentadorId), adivinhador: nomeDe(sala, r2.adivinhadorId) })` com `const r2 = sala.jogo.rodada` |
| `mudarParaMimica`, após a chamada de game | `registrar('mudouParaMimica', { sala: sala.codigo, rodada: sala.jogo.rodada.numero })` |
| `comprarDica`, após a chamada de game | `const ult = sala.jogo.rodada.dicasCompradas.at(-1); registrar('dicaComprada', { sala: sala.codigo, rodada: sala.jogo.rodada.numero, dica: ult.tipo, custo: ult.custo })` |
| `acertou`, após `game.acertou` | `const r2 = sala.jogo.rodada; registrar('acertou', { sala: sala.codigo, rodada: r2.numero, musica: r2.musica.titulo, pontos: r2.pontosGanhos, bonusApresentador: r2.bonusApresentador || undefined }); registrarFimSeAcabou(sala)` |
| `passar`, após `game.passar` | `const r2 = sala.jogo.rodada; registrar('passou', { sala: sala.codigo, rodada: r2.numero, musica: r2.musica.titulo }); registrarFimSeAcabou(sala)` |
| `iniciarTimer`, após `game.tempoEsgotado` | `const r2 = jogo.rodada; registrar('tempoEsgotado', { sala: sala.codigo, rodada: r2.numero, musica: r2.musica.titulo }); registrarFimSeAcabou(sala)` |

Helper (perto de `salasResumo`) — atenção: o jogo só vai a `fim` em `proximaRodada`, então cheque a última rodada:

```js
function registrarFimSeAcabou(sala) {
  const { jogo } = sala;
  if (jogo.rodadasJogadas < config.rodada.totalRodadas) return;
  registrador.registrar('fimDeJogo', {
    sala: sala.codigo,
    placar: jogo.modo === 'x1' ? jogo.pontosJogadores
      : Object.fromEntries(Object.values(jogo.duplas).map((d) => [d.numero, d.pontos])),
  });
}
```

(Confirme no `src/game.js` o nome do contador de rodadas jogadas — o estado tem `rodadasJogadas`; se o incremento acontecer em outro lugar, ajuste a condição para "esta era a última rodada".)

No bloco `require.main === module`:

```js
const { criarRegistrador } = require('./eventos'); // já importado no topo
const registrador = criarRegistrador({ arquivo: path.join(__dirname, '..', 'data', 'eventos.jsonl') });
const { httpServer, monitorToken } = criarServidor({ config, banco, registrador });
// ... e no listen():
console.log(`  Monitor:  http://localhost:${porta}/monitor/?token=${monitorToken}`);
```

E `return { app, httpServer, io, monitorToken };`

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — 56 antigos + 5 da Task 1 + 4 novos

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "Servidor instrumentado: eventos do jogo, token e /api/monitor"
```

---

### Task 3: Painel `public/monitor/`

**Files:**
- Create: `public/monitor/index.html`
- Create: `public/monitor/app.js`

**Interfaces:**
- Consumes: `GET /api/monitor?token=`, socket `monitorar(token, cb)`, eventos `monitorEvento`/`monitorSalas` (Task 2).

- [ ] **Step 1: Criar `public/monitor/index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DESAFINO — Monitor</title>
  <link rel="stylesheet" href="/shared/neoretro.css">
  <style>
    body { padding: clamp(12px, 3vw, 24px); max-width: 1100px; margin: 0 auto;
           display: flex; flex-direction: column; gap: 16px; }
    .contadores { display: flex; gap: 12px; flex-wrap: wrap; }
    .contador { flex: 1; min-width: 140px; text-align: center; }
    .contador b { font-size: 2rem; display: block; }
    .colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
    @media (max-width: 800px) { .colunas { grid-template-columns: 1fr; } }
    .sala-card { margin-bottom: 12px; }
    .sala-card h3 { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .jogador-linha { display: flex; align-items: center; gap: 6px; }
    #feed { list-style: none; padding: 0; margin: 0; max-height: 70vh; overflow-y: auto;
            display: flex; flex-direction: column; gap: 6px; }
    #feed li { border: 2px solid var(--outline); border-radius: 8px; padding: 6px 10px;
               background: #fff; font-size: 0.9rem; }
    #feed .hora { opacity: 0.6; margin-right: 6px; font-variant-numeric: tabular-nums; }
    #feed .sala-tag { font-weight: 800; margin-right: 6px; }
    .erro { color: #93000a; font-weight: 800; }
  </style>
</head>
<body>
  <h1 class="logo">DESAFINO — Monitor 📡</h1>
  <p id="erro" class="erro oculto">Token inválido — abra /monitor/?token=SEU_TOKEN (veja o log do servidor).</p>
  <div class="contadores">
    <div class="card contador">🏠 Salas <b id="c-salas">0</b></div>
    <div class="card contador">👥 Conectados <b id="c-jogadores">0</b></div>
    <div class="card contador">📜 Eventos <b id="c-eventos">0</b></div>
  </div>
  <div class="colunas">
    <section class="card"><h2>Salas ativas</h2><div id="salas"></div></section>
    <section class="card"><h2>Feed de eventos</h2><ul id="feed"></ul></section>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

(Confira em `public/shared/neoretro.css` se a classe utilitária de esconder é `oculto` — é a usada nas outras telas.)

- [ ] **Step 2: Criar `public/monitor/app.js`**

```js
'use strict';
const $ = (id) => document.getElementById(id);
function esc(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

const NOME_EVENTO = {
  salaCriada: '🏠 Sala criada', salaExpirada: '⌛ Sala expirada', salaReiniciada: '🔄 Sala reiniciada',
  jogadorEntrou: '👤 Jogador entrou', jogadorReconectou: '🔁 Jogador reconectou',
  jogadorRemovido: '🚫 Jogador removido',
  socketConectado: '🔌 Socket conectado', socketDesconectado: '📴 Socket desconectado',
  partidaIniciada: '🎬 Partida iniciada', rodadaComecou: '▶️ Rodada começou',
  mudouParaMimica: '🎭 Virou mímica', dicaComprada: '💡 Dica comprada',
  acertou: '🎉 Acertou', passou: '⏭ Passou', tempoEsgotado: '⏰ Tempo esgotado',
  fimDeJogo: '🏆 Fim de jogo',
};
const NOME_FASE = { lobby: 'Lobby', rodada: 'Em jogo', fim: 'Fim' };

const token = new URLSearchParams(location.search).get('token') || '';
let totalEventos = 0;

function renderSalas(salas) {
  $('c-salas').textContent = salas.length;
  $('c-jogadores').textContent =
    salas.reduce((n, s) => n + s.jogadores.filter((j) => j.conectado).length, 0);
  $('salas').innerHTML = salas.length === 0 ? '<p>Nenhuma sala ativa.</p>' : salas.map((s) => `
    <div class="card sala-card">
      <h3><span>${s.codigo}</span>
        <span class="pill">${NOME_FASE[s.fase] || s.fase}${s.rodadaNumero ? ` · R${s.rodadaNumero}` : ''}${s.modoJogo === 'x1' ? ' · x1 ⚔️' : ''}</span></h3>
      ${s.jogadores.map((j) => `<div class="jogador-linha">${j.conectado ? '🟢' : '🔴'}
        ${esc(j.nome)} <small>(dupla ${j.dupla})</small></div>`).join('') || '<p>Sem jogadores.</p>'}
    </div>`).join('');
}

function detalhes(e) {
  const partes = [];
  if (e.nome) partes.push(esc(e.nome));
  if (e.jogadores) partes.push(e.jogadores.map(esc).join(' & '));
  if (e.apresentador) partes.push(`${esc(e.apresentador)} → ${esc(e.adivinhador)}`);
  if (e.rodada) partes.push(`rodada ${e.rodada}`);
  if (e.dica) partes.push(`${e.dica} (−${e.custo})`);
  if (e.musica) partes.push(`"${esc(e.musica)}"`);
  if (e.pontos != null) partes.push(`+${e.pontos} pts${e.bonusApresentador ? ` (+${e.bonusApresentador} apresentador)` : ''}`);
  if (e.placar) partes.push(Object.entries(e.placar).map(([k, v]) => `${k}: ${v}`).join(' · '));
  return partes.join(' · ');
}

function adicionarEvento(e) {
  totalEventos += 1;
  $('c-eventos').textContent = totalEventos;
  const li = document.createElement('li');
  const hora = new Date(e.ts).toLocaleTimeString('pt-BR');
  li.innerHTML = `<span class="hora">${hora}</span>` +
    (e.sala ? `<span class="sala-tag">${esc(e.sala)}</span>` : '') +
    `${NOME_EVENTO[e.tipo] || e.tipo} <small>${detalhes(e)}</small>`;
  $('feed').prepend(li);
  while ($('feed').children.length > 200) $('feed').lastChild.remove();
}

fetch(`/api/monitor?token=${encodeURIComponent(token)}`).then(async (r) => {
  if (!r.ok) return $('erro').classList.remove('oculto');
  const { salas, eventos } = await r.json();
  renderSalas(salas);
  for (const e of eventos) adicionarEvento(e); // mais novos terminam no topo
  const socket = io();
  const autenticar = () => socket.emit('monitorar', token, (resp) => {
    if (resp.erro) $('erro').classList.remove('oculto');
  });
  socket.on('connect', autenticar);
  socket.on('monitorSalas', renderSalas);
  socket.on('monitorEvento', adicionarEvento);
});
```

- [ ] **Step 3: Teste manual**

```bash
MONITOR_TOKEN=teste123 PORT=3999 node src/server.js &
open "http://localhost:3999/monitor/?token=teste123"
# noutra aba: display cria sala, /jogar entra — o feed deve mostrar tudo ao vivo
curl -s "http://localhost:3999/api/monitor?token=errado" | grep -q "Token inválido" && echo "403 OK"
kill %1
```

Expected: painel mostra a sala/jogadores ao vivo; token errado dá 403; sem token na URL a página mostra a mensagem de erro.

- [ ] **Step 4: Commit**

```bash
git add public/monitor/
git commit -m "Painel /monitor: salas ao vivo e feed de eventos"
```

---

### Task 4: Infra — gitignore, launchd, compose, README

**Files:**
- Modify: `.gitignore`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `~/Library/LaunchAgents/com.desafino.server.plist` (fora do repo)

**Interfaces:**
- Consumes: `MONITOR_TOKEN` (Task 2) e o log em `data/eventos.jsonl`.

- [ ] **Step 1: Ignorar o log**

`.gitignore` ganha a linha `data/eventos.jsonl`.

- [ ] **Step 2: Token no docker-compose**

No serviço, junto das chaves existentes:

```yaml
    environment:
      - MONITOR_TOKEN=${MONITOR_TOKEN:-}
```

(vazio → o servidor gera um aleatório e imprime no log do container.)

- [ ] **Step 3: Token fixo no launchd local**

Gerar token e adicionar ao plist (dentro do `<dict>` raiz):

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>MONITOR_TOKEN</key>
  <string>SAIDA_DE_openssl_rand_hex_8</string>
</dict>
```

```bash
TOKEN=$(openssl rand -hex 8)  # editar o plist com esse valor
launchctl unload ~/Library/LaunchAgents/com.desafino.server.plist
launchctl load ~/Library/LaunchAgents/com.desafino.server.plist
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/monitor?token=$TOKEN"  # 200
```

- [ ] **Step 4: README**

Nova seção depois de "Hospedagem":

```markdown
## Monitoramento

`/monitor/?token=SEU_TOKEN` mostra ao vivo as salas ativas, quem está conectado e o
feed de eventos (entradas, rodadas, dicas, acertos). O token vem da variável de
ambiente `MONITOR_TOKEN`; sem ela, o servidor gera um aleatório e imprime no log
na subida. Todos os eventos também ficam em `data/eventos.jsonl` (uma linha JSON
por evento — `tail -f` ou `jq` para acompanhar), que no Docker vive no volume `dados`.
```

- [ ] **Step 5: Verificação final e commit**

```bash
npm test                                   # tudo verde
git add .gitignore docker-compose.yml README.md
git commit -m "Monitoramento: token no compose, log ignorado e docs"
git push
```

Depois do push, conferir que os workflows CI e Docker passaram (`gh run list -L 2`) e que o público responde: `curl -s -o /dev/null -w "%{http_code}" https://macbook-pro-de-rodrigo.tail46302c.ts.net/monitor/` (200 — página estática; o dado exige token).
