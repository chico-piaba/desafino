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
