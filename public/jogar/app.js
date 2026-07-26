'use strict';

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

// Rebrand: migra chaves antigas desafino* → humatune* sem perder perfil nem sala
for (const [antiga, nova] of [
  ['desafinoPerfil', 'humatunePerfil'],
  ['desafinoPlayerId', 'humatunePlayerId'],
  ['desafinoSala', 'humatuneSala'],
  ['desafinoSugestoesPendentes', 'humatuneSugestoesPendentes'],
]) {
  if (localStorage.getItem(antiga) !== null && localStorage.getItem(nova) === null) {
    localStorage.setItem(nova, localStorage.getItem(antiga));
  }
  localStorage.removeItem(antiga);
}

const socket = io();
const $ = (id) => document.getElementById(id);
const NOME_DICA = {
  cantor: '🎤 Cantor',
  ano: '📅 Ano',
  decada: '🕰 Década',
  genero: '🎶 Gênero',
  inicialDoTitulo: '🔤 Inicial do título',
  forca: '🪢 Forca',
};
let ultimoEstado = null;

function entrar(dados) {
  socket.emit('entrar', dados, (resposta) => {
    if (resposta.erro) {
      // Reconexão automática com sala/playerId de partida antiga: limpa e volta pra entrada
      if (dados.playerId && !dados.nome) {
        localStorage.removeItem('humatunePlayerId');
        localStorage.removeItem('humatuneSala');
        if (ultimoEstado) render(ultimoEstado);
        return;
      }
      return mostrarErro(resposta.erro);
    }
    localStorage.setItem('humatunePlayerId', resposta.playerId);
    localStorage.setItem('humatuneSala', resposta.sala);
    if (resposta.estado) {
      ultimoEstado = resposta.estado;
      render(resposta.estado);
    }
  });
}

const salaDaUrl = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 4);
$('campo-sala').value = salaDaUrl || localStorage.getItem('humatuneSala') || '';

// ---- Perfil e builder de avatar ----
const PECAS = [
  ['fundo', '🎨 Fundo'], ['rosto', '🙂 Rosto'], ['olhos', '👀 Olhos'],
  ['boca', '👄 Boca'], ['acessorio', '🎩 Acessório'],
];
let perfil;
try { perfil = JSON.parse(localStorage.getItem('humatunePerfil') || 'null'); } catch { perfil = null; }
if (!perfil || !perfil.avatar) perfil = { nome: '', avatar: DesafinoAvatar.avatarAleatorio() };
$('campo-nome').value = perfil.nome || '';

function renderAvatarPreview() {
  $('avatar-preview').innerHTML = DesafinoAvatar.avatarSvg(perfil.avatar);
}

$('builder').innerHTML = PECAS.map(([peca, rotulo]) =>
  `<div class="linha-peca"><span>${rotulo}</span><span>
    <button type="button" class="btn btn-peca" data-peca="${peca}" data-dir="-1">◀</button>
    <button type="button" class="btn btn-peca" data-peca="${peca}" data-dir="1">▶</button>
  </span></div>`
).join('') +
  '<button type="button" id="btn-sortear" class="btn btn-secondary" style="width:100%;margin-top:6px">🎲 Aleatório</button>';

for (const btn of $('builder').querySelectorAll('button[data-peca]')) {
  btn.onclick = () => {
    const peca = btn.dataset.peca;
    const n = DesafinoAvatar.TAMANHOS[peca];
    perfil.avatar[peca] = ((perfil.avatar[peca] || 0) + Number(btn.dataset.dir) + n) % n;
    renderAvatarPreview();
  };
}
$('btn-sortear').onclick = () => {
  perfil.avatar = DesafinoAvatar.avatarAleatorio();
  renderAvatarPreview();
};
renderAvatarPreview();

for (const btn of $('emotes').querySelectorAll('button[data-emote]')) {
  btn.onclick = () => socket.emit('emote', btn.dataset.emote);
}

socket.on('connect', () => {
  const playerId = localStorage.getItem('humatunePlayerId');
  const sala = localStorage.getItem('humatuneSala');
  if (playerId && sala) entrar({ sala, playerId });
});

$('btn-entrar').onclick = () => {
  perfil.nome = $('campo-nome').value.trim();
  localStorage.setItem('humatunePerfil', JSON.stringify(perfil));
  // Envia o playerId salvo: se este aparelho já entrou nesta sala, o servidor
  // reconecta em vez de criar um jogador duplicado.
  entrar({
    sala: $('campo-sala').value.trim().toUpperCase(),
    nome: perfil.nome,
    dupla: $('campo-dupla').value,
    avatar: perfil.avatar,
    playerId: localStorage.getItem('humatunePlayerId') || undefined,
  });
};

socket.on('removido', () => {
  localStorage.removeItem('humatunePlayerId');
  mostrarErro('Você saiu da sala — entre novamente.');
  if (ultimoEstado) render(ultimoEstado);
});

socket.on('erro', mostrarErro);
socket.on('tick', (t) => { $('tempo').textContent = t; });

socket.on('estado', (e) => {
  ultimoEstado = e;
  render(e);
});

function mostrarTela(id) {
  for (const s of document.querySelectorAll('.tela')) s.classList.add('oculto');
  $(id).classList.remove('oculto');
}

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

function render(e) {
  const entrou = Boolean(e.voce) || (e.fase === 'lobby' && localStorage.getItem('humatunePlayerId') && e.jogadores.length > 0);
  const emRodada = e.fase === 'rodada' && e.rodada && e.rodada.fase !== 'resultado';
  // Telefone ocioso (lobby ou plateia) pode sugerir músicas pro banco.
  // Guarda contra HTML antigo em cache (deploy quente sem restart).
  if ($('sugerir')) {
    const ocioso = (e.fase === 'lobby' && (Boolean(e.voce) || entrou)) ||
      (emRodada && e.voce && e.voce.papel === 'plateia');
    $('sugerir').classList.toggle('oculto', !ocioso);
  }
  $('timer-jogador').classList.toggle('oculto', !(emRodada && e.rodada.fase === 'emAndamento'));
  if (emRodada && e.rodada.fase === 'emAndamento' && e.tempoRestante != null) {
    $('tempo').textContent = e.tempoRestante;
  }

  if (e.fase === 'lobby') {
    $('emotes').classList.toggle('oculto', !entrou);
    $('espera-titulo').textContent = 'Você está dentro!';
    $('espera-texto').textContent = 'Aguardando a partida começar…';
    renderPainelLider(e);
    return mostrarTela(e.voce || entrou ? 'tela-espera' : 'tela-entrar');
  }
  $('painel-lider').classList.add('oculto');
  $('emotes').classList.add('oculto');
  if (e.fase === 'fim') {
    $('espera-titulo').textContent = '🏆 Fim de jogo!';
    $('espera-texto').textContent = 'Veja o resultado no display.';
    return mostrarTela('tela-espera');
  }
  if (!e.voce) return mostrarTela('tela-entrar');
  if (e.rodada.fase === 'resultado') {
    const r = e.rodada;
    $('espera-titulo').textContent = r.pontosGanhos > 0 ? '🎉 Acertaram!' : '😅 Rodada encerrada';
    $('espera-texto').textContent = (e.modoJogo === 'x1'
      ? `+${r.pontosGanhos} pts ${r.adivinhador}` + (r.bonusApresentador ? ` e +${r.bonusApresentador} pts ${r.apresentador}` : '')
      : `+${r.pontosGanhos} pts para a Dupla ${r.dupla}`) + '. Próxima rodada já vem…';
    return mostrarTela('tela-espera');
  }
  if (e.voce.papel === 'apresentador') return renderApresentador(e);
  if (e.voce.papel === 'adivinhador') return renderAdivinhador(e);
  renderPlateia(e);
}

function renderApresentador(e) {
  mostrarTela('tela-apresentador');
  $('musica-titulo').textContent = e.voce.musica.titulo;
  $('musica-artista').textContent = e.voce.musica.artista;
  const andamento = e.rodada.fase === 'emAndamento';
  $('btn-comecar').classList.toggle('oculto', andamento);
  $('btn-mimica').classList.toggle('oculto', !andamento || e.rodada.modo === 'mimica');
  // O apresentador resolve a rodada mesmo com a votação da plateia aberta — não é
  // vetado por ela — por isso este botão soma 'votacao' aos casos visíveis, ao
  // contrário dos outros botões acima, que ficam só em 'emAndamento'.
  $('btn-acertou').classList.toggle('oculto', !(andamento || e.rodada.fase === 'votacao'));
  $('btn-passar').classList.toggle('oculto', !andamento);
  $('btn-trocar').classList.toggle('oculto', !e.voce.podeTrocar);
  $('btn-trocar').textContent = `🔀 Trocar música (−${e.configSala.trocaCusto} pts)`;
}

function renderAdivinhador(e) {
  mostrarTela('tela-adivinhador');
  $('valor').textContent = e.rodada.valorAtual;
  const aguardando = e.rodada.fase === 'aguardandoInicio';
  $('lista-dicas').innerHTML = aguardando
    ? '<p>Aguarde o apresentador começar…</p>'
    : Object.entries(e.voce.precos).map(([tipo, custo]) => {
        const comprada = e.voce.dicas.find((d) => d.tipo === tipo);
        const rotulo = NOME_DICA[tipo] || tipo;
        if (comprada) {
          const classe = tipo === 'forca' ? 'pill forca-pill' : 'pill';
          return `<div class="dica"><b>${rotulo}:</b> <span class="${classe}">${esc(comprada.conteudo)}</span></div>`;
        }
        return `<div class="dica"><span>${rotulo}</span>
          <button class="btn btn-tertiary" data-tipo="${tipo}" style="padding:8px 16px">−${custo} pts</button></div>`;
      }).join('');
  for (const btn of $('lista-dicas').querySelectorAll('button[data-tipo]')) {
    btn.onclick = () => socket.emit('comprarDica', btn.dataset.tipo);
  }
  $('btn-eu-acertei').classList.toggle('oculto', e.rodada.fase !== 'emAndamento');
}

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

$('btn-comecar').onclick = () => socket.emit('comecarRodada');
$('btn-mimica').onclick = () => socket.emit('mudarParaMimica');
$('btn-acertou').onclick = () => socket.emit('acertou');
$('btn-passar').onclick = () => socket.emit('passar');
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

let erroTimeout = null;
function mostrarErro(msg) {
  $('erro').textContent = msg;
  clearTimeout(erroTimeout);
  erroTimeout = setTimeout(() => { $('erro').textContent = ''; }, 4000);
}

// ---- Sugestões de músicas (telefones ociosos) ----
// Se o servidor ainda não tiver o endpoint (ou a rede cair), a sugestão fica
// numa fila local e é reenviada sozinha — nada se perde.
const FILA_SUGESTOES = 'humatuneSugestoesPendentes';

function filaSugestoes() {
  try { return JSON.parse(localStorage.getItem(FILA_SUGESTOES) || '[]'); } catch { return []; }
}

async function postarSugestao(s) {
  const r = await fetch('/api/sugestoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
  if (!r.ok) throw new Error('endpoint indisponível');
}

async function reenviarFila() {
  const fila = filaSugestoes();
  if (!fila.length) return;
  const restantes = [];
  for (const s of fila) {
    try { await postarSugestao(s); } catch { restantes.push(s); }
  }
  localStorage.setItem(FILA_SUGESTOES, JSON.stringify(restantes));
}

let statusSugestaoTimeout = null;
function mostrarStatusSugestao(msg) {
  $('status-sugestao').textContent = msg;
  clearTimeout(statusSugestaoTimeout);
  statusSugestaoTimeout = setTimeout(() => { $('status-sugestao').textContent = ''; }, 5000);
}

async function enviarSugestao(m) {
  const sugestao = {
    ...m,
    sala: localStorage.getItem('humatuneSala') || null,
    sugeridoPor: perfil.nome || null,
  };
  try {
    await postarSugestao(sugestao);
    mostrarStatusSugestao('✅ Sugestão enviada!');
    reenviarFila();
  } catch {
    localStorage.setItem(FILA_SUGESTOES, JSON.stringify([...filaSugestoes(), sugestao]));
    mostrarStatusSugestao('📦 Guardada no aparelho — envio automático em breve.');
  }
}

if ($('sugerir')) {
$('btn-buscar-sugestao').onclick = async () => {
  const q = $('campo-sugestao').value.trim();
  if (!q) return;
  $('resultados-sugestao').innerHTML = '<p>Buscando…</p>';
  const resposta = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
  if (!resposta.ok) {
    $('resultados-sugestao').innerHTML = '';
    return mostrarStatusSugestao('😵 Busca indisponível agora — tente de novo já já.');
  }
  const resultados = await resposta.json();
  $('resultados-sugestao').innerHTML = resultados.slice(0, 6)
    .map((r, i) => `<div class="dica"><span><b>${esc(r.titulo)}</b>${r.artista ? ` — ${esc(r.artista)}` : ''}${r.ano ? ` (${r.ano})` : ''}</span>
      <button class="btn btn-tertiary" data-i="${i}" style="padding:8px 14px">Sugerir</button></div>`)
    .join('') || '<p>Nada encontrado.</p>';
  for (const btn of $('resultados-sugestao').querySelectorAll('button[data-i]')) {
    btn.onclick = () => {
      enviarSugestao(resultados[Number(btn.dataset.i)]);
      btn.disabled = true;
      btn.textContent = 'Valeu!';
    };
  }
};
$('campo-sugestao').onkeydown = (ev) => { if (ev.key === 'Enter') $('btn-buscar-sugestao').onclick(); };
}

reenviarFila();
setInterval(reenviarFila, 60000);
