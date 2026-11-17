'use strict';

const net = require('node:net');

/**
 * Só escutamos em 127.0.0.1 e sempre em porta livre escolhida em runtime:
 * duas clínicas na mesma máquina (ou uma atualização do programa) nunca
 * brigam por porta, e nada fica exposto na rede local.
 */

function portaLivre() {
  return new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.unref();
    servidor.on('error', reject);
    servidor.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

/** Espera uma porta responder (usado antes de abrir a janela). */
function esperarPorta(porta, { timeoutMs = 60_000, intervaloMs = 250, caminho = '/' } = {}) {
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    const tentar = () => {
      const socket = net.connect({ port: porta, host: '127.0.0.1' });
      socket.setTimeout(1_500);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      const falhar = () => {
        socket.destroy();
        if (Date.now() - inicio > timeoutMs) {
          reject(new Error(`A porta ${porta}${caminho} não respondeu em ${Math.round(timeoutMs / 1000)}s.`));
          return;
        }
        setTimeout(tentar, intervaloMs);
      };
      socket.once('error', falhar);
      socket.once('timeout', falhar);
    };
    tentar();
  });
}

module.exports = { portaLivre, esperarPorta };
