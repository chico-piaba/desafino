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
  fimDeJogo: '🏆 Fim de jogo', musicaSugerida: '💌 Música sugerida',
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
