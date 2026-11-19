'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { baixarArquivoClinica } from '@/lib/armazenamento';
import { caminhoFotoPaciente } from '@/lib/caminhosArquivo';

/**
 * Foto de perfil do paciente, lida pela rota autenticada e mostrada como
 * objectURL desta aba. A foto é dado pessoal: não existe link público dela.
 *
 * `pacientes.foto_url` só diz se há foto e qual a versão; o arquivo vem
 * sempre do caminho do próprio paciente, nunca de um endereço gravado no banco.
 */

const TIPOS_FOTO = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Lista longa de pacientes: poucas leituras de cada vez, e só das linhas visíveis. */
const SIMULTANEAS = 4;
const MAXIMO_GUARDADAS = 200;
/** Paciente sem foto no armazenamento (ou de outra clínica) não é pedido de novo a cada render. */
const ESPERA_APOS_FALHA_MS = 60_000;

const prontas = new Map<string, string>();
const pendentes = new Map<string, Promise<string | null>>();
const falhas = new Map<string, number>();
const emUso = new Map<string, number>();
const fila: Array<() => void> = [];
let ativas = 0;
let ouvindoSaida = false;

/** Recepção com computador compartilhado: quem entra depois não herda as fotos já baixadas. */
function esquecerAoSair() {
  if (ouvindoSaida) return;
  ouvindoSaida = true;
  supabase.auth.onAuthStateChange((evento) => {
    if (evento !== 'SIGNED_OUT') return;
    for (const url of prontas.values()) URL.revokeObjectURL(url);
    prontas.clear();
    falhas.clear();
  });
}

function chaveDa(caminho: string, fotoUrl: string) {
  return `${caminho}|${fotoUrl}`;
}

function usar(chave: string) {
  emUso.set(chave, (emUso.get(chave) || 0) + 1);
}

function soltar(chave: string) {
  const restantes = (emUso.get(chave) || 1) - 1;
  if (restantes > 0) emUso.set(chave, restantes);
  else emUso.delete(chave);
}

/** Libera as fotos mais antigas que nenhuma tela está mostrando. */
function aparar() {
  for (const [chave, url] of prontas) {
    if (prontas.size <= MAXIMO_GUARDADAS) return;
    if (emUso.has(chave)) continue;
    prontas.delete(chave);
    URL.revokeObjectURL(url);
  }
}

function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const rodar = () => {
      ativas += 1;
      tarefa().then(resolve, reject).finally(() => {
        ativas -= 1;
        fila.shift()?.();
      });
    };
    if (ativas < SIMULTANEAS) rodar();
    else fila.push(rodar);
  });
}

async function baixar(caminho: string): Promise<string | null> {
  const recebido = await baixarArquivoClinica(caminho);
  const tipo = (recebido.type || '').split(';')[0].trim().toLowerCase();
  if (!TIPOS_FOTO.has(tipo)) return null;
  return URL.createObjectURL(new Blob([recebido], { type: tipo }));
}

function obter(chave: string, caminho: string): Promise<string | null> {
  const pronta = prontas.get(chave);
  if (pronta) return Promise.resolve(pronta);
  const falhou = falhas.get(chave);
  if (falhou && Date.now() - falhou < ESPERA_APOS_FALHA_MS) return Promise.resolve(null);
  let pendente = pendentes.get(chave);
  if (!pendente) {
    pendente = naFila(async () => {
      // Saiu da tela enquanto esperava a vez: não baixa.
      if (!emUso.has(chave)) return undefined;
      return baixar(caminho);
    })
      .then((url) => {
        if (url) {
          prontas.set(chave, url);
          falhas.delete(chave);
          aparar();
        } else if (url === null) {
          falhas.set(chave, Date.now());
        }
        return url ?? null;
      })
      .catch(() => {
        falhas.set(chave, Date.now());
        return null;
      })
      .finally(() => pendentes.delete(chave));
    pendentes.set(chave, pendente);
  }
  return pendente;
}

/** Depois do envio, a foto escolhida aparece na hora, sem baixar de novo. */
export function guardarFotoPaciente(pacienteId: string, fotoUrl: string, foto: Blob) {
  const caminho = caminhoFotoPaciente(pacienteId);
  const tipo = (foto.type || '').split(';')[0].trim().toLowerCase();
  if (!caminho || !TIPOS_FOTO.has(tipo)) return;
  const chave = chaveDa(caminho, fotoUrl);
  if (prontas.has(chave)) return;
  esquecerAoSair();
  prontas.set(chave, URL.createObjectURL(new Blob([foto], { type: tipo })));
  falhas.delete(chave);
  aparar();
}

/**
 * objectURL da foto do paciente, ou null enquanto carrega, sem foto ou sem
 * permissão (a tela mostra as iniciais). Com `ativo` falso não baixa nada:
 * listas passam a visibilidade da linha.
 */
export function useFotoPaciente(
  pacienteId: string | number | null | undefined,
  fotoUrl: string | null | undefined,
  ativo = true,
): string | null {
  const caminho = fotoUrl && pacienteId != null && pacienteId !== '' ? caminhoFotoPaciente(String(pacienteId)) : null;
  const chave = caminho && fotoUrl ? chaveDa(caminho, fotoUrl) : null;
  const [url, setUrl] = useState<string | null>(() => (chave ? prontas.get(chave) ?? null : null));

  useEffect(() => {
    if (!chave || !caminho) {
      setUrl(null);
      return;
    }
    esquecerAoSair();
    usar(chave);
    const pronta = prontas.get(chave) ?? null;
    setUrl(pronta);
    let vivo = true;
    if (!pronta && ativo) {
      obter(chave, caminho).then((nova) => {
        if (vivo) setUrl(nova);
      });
    }
    return () => {
      vivo = false;
      soltar(chave);
    };
  }, [chave, caminho, ativo]);

  return url;
}
