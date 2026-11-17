import { supabase } from '@/lib/supabase';
import { modoDados } from '@/lib/local/cliente';

/**
 * Mesma cara do `supabase.from()`, com dois destinos.
 *
 * No site, repete a cadeia no Supabase. No aplicativo, lê e grava o SQLite.
 * As telas não escolhem: se o programa está sem rede, a clínica continua
 * no banco local.
 */

type Filtro = { col: string; op: string; valor?: unknown };
type Ordem = { col: string; asc?: boolean };
type Chamada = { metodo: string; args: unknown[] };

type Resultado = {
  data: any;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

type Campo = { tipo: 'col'; nome: string } | { tipo: 'embed'; tabela: string; campos: Campo[] };

/** Coluna na linha atual que aponta para a tabela embutida (pacientes → paciente_id). */
function fkDaTabela(tabela: string): string {
  const mapa: Record<string, string> = {
    pacientes: 'paciente_id',
    profissionais: 'profissional_id',
    clinicas: 'clinica_id',
    planos: 'plano_id',
    agendamentos: 'agendamento_id',
    tarefas: 'tarefa_id',
  };
  return mapa[tabela] || `${tabela.replace(/s$/, '')}_id`;
}

function parseOr(texto: string): Filtro[] {
  const partes: string[] = [];
  let atual = '';
  let nivel = 0;
  for (const ch of texto) {
    if (ch === '(') nivel += 1;
    if (ch === ')') nivel = Math.max(0, nivel - 1);
    if (ch === ',' && nivel === 0) {
      if (atual.trim()) partes.push(atual.trim());
      atual = '';
      continue;
    }
    atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());

  const filtros: Filtro[] = [];
  for (const parte of partes) {
    const lista = parte.match(/^([a-z_][a-z0-9_]*)\.in\.\((.*)\)$/i);
    if (lista) {
      filtros.push({
        col: lista[1],
        op: 'in',
        valor: lista[2].split(',').map((item) => item.trim()).filter(Boolean),
      });
      continue;
    }
    const nulo = parte.match(/^([a-z_][a-z0-9_]*)\.is\.null$/i);
    if (nulo) {
      filtros.push({ col: nulo[1], op: 'is', valor: null });
      continue;
    }
    const simples = parte.match(/^([a-z_][a-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike)\.(.*)$/i);
    if (simples) filtros.push({ col: simples[1], op: simples[2].toLowerCase(), valor: simples[3] });
  }
  return filtros;
}

function parseCampos(texto: string): Campo[] {
  const campos: Campo[] = [];
  const s = texto.trim();
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (s[i] === ',' || s[i] === ' ')) i += 1;
    if (i >= s.length) break;
    let nome = '';
    while (i < s.length && /[a-z0-9_*]/i.test(s[i])) {
      nome += s[i];
      i += 1;
    }
    if (!nome) {
      i += 1;
      continue;
    }
    if (s[i] === '(') {
      i += 1;
      const inicio = i;
      let nivel = 1;
      while (i < s.length && nivel > 0) {
        if (s[i] === '(') nivel += 1;
        else if (s[i] === ')') nivel -= 1;
        if (nivel > 0) i += 1;
      }
      const interno = s.slice(inicio, i);
      if (s[i] === ')') i += 1;
      campos.push({ tipo: 'embed', tabela: nome, campos: parseCampos(interno) });
    } else {
      campos.push({ tipo: 'col', nome });
    }
  }
  return campos;
}

function projetar(linha: Record<string, unknown>, colunas: string[]): Record<string, unknown> {
  if (!colunas.length || colunas.includes('*')) return { ...linha };
  const saida: Record<string, unknown> = {};
  for (const coluna of colunas) saida[coluna] = coluna in linha ? linha[coluna] : null;
  return saida;
}

function alertaData(dataLimite: unknown, status: unknown): string {
  if (!dataLimite || status === 'concluido') return 'normal';
  const hoje = new Date();
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const limite = new Date(`${String(dataLimite).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(limite.getTime())) return 'normal';
  if (limite < dia) return 'atrasada';
  const emTres = new Date(dia);
  emTres.setDate(emTres.getDate() + 3);
  if (limite <= emTres) return 'proxima';
  return 'normal';
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function postLocal(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resposta = await fetch('/api/local/db', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify(corpo),
    cache: 'no-store',
  });
  const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; dados?: unknown; total?: number };
  if (!resposta.ok) throw new Error(dados.erro || 'Falha no banco local.');
  return dados;
}

async function consultar(tabela: string, filtros: Filtro[], ordem: Ordem[] = [], limite?: number, offset?: number) {
  const dados = await postLocal({ tabela, op: 'select', filtros, ordem, limite, offset });
  return (dados.dados || []) as Record<string, unknown>[];
}

function projetarCampos(linha: Record<string, unknown>, campos: Campo[]): Record<string, unknown> {
  const colunas = campos.filter((campo): campo is { tipo: 'col'; nome: string } => campo.tipo === 'col').map((campo) => campo.nome);
  const base = projetar(linha, colunas);
  for (const campo of campos) {
    if (campo.tipo === 'embed') base[campo.tabela] = linha[campo.tabela] ?? null;
  }
  return base;
}

async function hidratar(tabela: string, linhas: Record<string, unknown>[], campos: Campo[]) {
  if (tabela === 'v_tarefas_completo' || !linhas.length) return linhas;
  const embeds = campos.filter((campo): campo is { tipo: 'embed'; tabela: string; campos: Campo[] } => campo.tipo === 'embed');
  for (const embed of embeds) {
    const fkDireto = fkDaTabela(embed.tabela);
    const direto = linhas.some((linha) => Object.prototype.hasOwnProperty.call(linha, fkDireto));
    try {
      if (direto) {
        const ids = [...new Set(linhas.map((linha) => linha[fkDireto]).filter((valor) => valor != null))];
        let relacionados = ids.length
          ? await consultar(embed.tabela, [{ col: 'id', op: 'in', valor: ids }])
          : [];
        relacionados = await hidratar(embed.tabela, relacionados, embed.campos);
        const mapa = new Map(relacionados.map((linha) => [String(linha.id), linha]));
        for (const linha of linhas) {
          const alvo = mapa.get(String(linha[fkDireto] ?? ''));
          linha[embed.tabela] = alvo ? projetarCampos(alvo, embed.campos) : null;
        }
        continue;
      }
      const fkFilho = fkDaTabela(tabela);
      const ids = [...new Set(linhas.map((linha) => linha.id).filter((valor) => valor != null))];
      let filhos = ids.length
        ? await consultar(embed.tabela, [{ col: fkFilho, op: 'in', valor: ids }])
        : [];
      filhos = await hidratar(embed.tabela, filhos, embed.campos);
      for (const linha of linhas) {
        linha[embed.tabela] = filhos
          .filter((filho) => String(filho[fkFilho]) === String(linha.id))
          .map((filho) => projetarCampos(filho, embed.campos));
      }
    } catch {
      for (const linha of linhas) linha[embed.tabela] = direto ? null : [];
    }
  }
  return linhas;
}

async function tarefasCompletas(filtros: Filtro[], ordem: Ordem[], limite?: number) {
  const tarefas = await consultar('tarefas', filtros, ordem, limite);
  const responsaveis = [...new Set(tarefas.map((t) => t.responsavel_id).filter((id) => id != null))];
  const pacientes = [...new Set(tarefas.map((t) => t.paciente_id).filter((id) => id != null))];
  const [profs, pacs] = await Promise.all([
    responsaveis.length ? consultar('profissionais', [{ col: 'id', op: 'in', valor: responsaveis }]) : Promise.resolve([]),
    pacientes.length ? consultar('pacientes', [{ col: 'id', op: 'in', valor: pacientes }]) : Promise.resolve([]),
  ]);
  const porProf = new Map(profs.map((linha) => [String(linha.id), linha]));
  const porPac = new Map(pacs.map((linha) => [String(linha.id), linha]));
  return tarefas.map((tarefa) => {
    const prof = porProf.get(String(tarefa.responsavel_id ?? ''));
    const pac = porPac.get(String(tarefa.paciente_id ?? ''));
    return {
      ...tarefa,
      responsavel_nome: prof?.nome ?? null,
      responsavel_user_id: prof?.user_id ?? null,
      paciente_nome: pac?.nome ?? null,
      paciente_telefone: pac?.telefone ?? null,
      alerta_data: alertaData(tarefa.data_limite, tarefa.status),
    };
  });
}

function finalizar(linhas: Record<string, unknown>[], cardinalidade: 'many' | 'one' | 'maybe'): Resultado {
  if (cardinalidade === 'many') return { data: linhas, error: null };
  if (linhas.length === 1) return { data: linhas[0], error: null };
  if (cardinalidade === 'maybe' && linhas.length === 0) return { data: null, error: null };
  return { data: null, error: { message: 'A consulta não devolveu uma única linha.' } };
}

class Consulta implements PromiseLike<Resultado> {
  private chamadas: Chamada[] = [];

  constructor(private tabela: string) {}

  select(...args: unknown[]) { this.chamadas.push({ metodo: 'select', args }); return this; }
  insert(...args: unknown[]) { this.chamadas.push({ metodo: 'insert', args }); return this; }
  update(...args: unknown[]) { this.chamadas.push({ metodo: 'update', args }); return this; }
  upsert(...args: unknown[]) { this.chamadas.push({ metodo: 'upsert', args }); return this; }
  delete(...args: unknown[]) { this.chamadas.push({ metodo: 'delete', args }); return this; }
  eq(...args: unknown[]) { this.chamadas.push({ metodo: 'eq', args }); return this; }
  neq(...args: unknown[]) { this.chamadas.push({ metodo: 'neq', args }); return this; }
  in(...args: unknown[]) { this.chamadas.push({ metodo: 'in', args }); return this; }
  is(...args: unknown[]) { this.chamadas.push({ metodo: 'is', args }); return this; }
  gte(...args: unknown[]) { this.chamadas.push({ metodo: 'gte', args }); return this; }
  lte(...args: unknown[]) { this.chamadas.push({ metodo: 'lte', args }); return this; }
  gt(...args: unknown[]) { this.chamadas.push({ metodo: 'gt', args }); return this; }
  lt(...args: unknown[]) { this.chamadas.push({ metodo: 'lt', args }); return this; }
  like(...args: unknown[]) { this.chamadas.push({ metodo: 'like', args }); return this; }
  ilike(...args: unknown[]) { this.chamadas.push({ metodo: 'ilike', args }); return this; }
  not(...args: unknown[]) { this.chamadas.push({ metodo: 'not', args }); return this; }
  or(...args: unknown[]) { this.chamadas.push({ metodo: 'or', args }); return this; }
  overlaps(...args: unknown[]) { this.chamadas.push({ metodo: 'overlaps', args }); return this; }
  order(...args: unknown[]) { this.chamadas.push({ metodo: 'order', args }); return this; }
  limit(...args: unknown[]) { this.chamadas.push({ metodo: 'limit', args }); return this; }
  range(...args: unknown[]) { this.chamadas.push({ metodo: 'range', args }); return this; }
  single(...args: unknown[]) { this.chamadas.push({ metodo: 'single', args }); return this; }
  maybeSingle(...args: unknown[]) { this.chamadas.push({ metodo: 'maybeSingle', args }); return this; }

  then<TResult1 = Resultado, TResult2 = never>(
    onfulfilled?: ((value: Resultado) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.executar().then(onfulfilled, onrejected);
  }

  private async executar(): Promise<Resultado> {
    const modo = await modoDados();
    if (modo !== 'local') return this.naNuvem();
    try {
      return await this.noLocal();
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Falha no banco local.' } };
    }
  }

  private async naNuvem(): Promise<Resultado> {
    let consulta: any = supabase.from(this.tabela);
    for (const chamada of this.chamadas) {
      const retorno = consulta[chamada.metodo](...chamada.args);
      if (retorno && typeof retorno === 'object') consulta = retorno;
    }
    return consulta;
  }

  private async noLocal(): Promise<Resultado> {
    let acao: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: unknown = null;
    let conflito: string | null = null;
    let select = '*';
    let pediuSelect = false;
    let soContagem = false;
    const filtros: Filtro[] = [];
    const ordem: Ordem[] = [];
    let limite: number | undefined;
    let offset: number | undefined;
    let cardinalidade: 'many' | 'one' | 'maybe' = 'many';
    const sobreposicoes: { col: string; valor: unknown[] }[] = [];

    for (const chamada of this.chamadas) {
      const [a, b] = chamada.args;
      switch (chamada.metodo) {
        case 'select':
          pediuSelect = true;
          select = typeof a === 'string' && a.trim() ? a : '*';
          soContagem = Boolean((b as { head?: boolean } | undefined)?.head);
          break;
        case 'insert':
          acao = 'insert';
          payload = a;
          break;
        case 'update':
          acao = 'update';
          payload = a;
          break;
        case 'upsert':
          acao = 'upsert';
          payload = a;
          conflito = (b as { onConflict?: string } | undefined)?.onConflict || null;
          break;
        case 'delete':
          acao = 'delete';
          break;
        case 'eq':
        case 'neq':
        case 'in':
        case 'is':
        case 'gte':
        case 'lte':
        case 'gt':
        case 'lt':
        case 'like':
        case 'ilike':
          filtros.push({ col: String(a), op: chamada.metodo, valor: b });
          break;
        case 'not':
          if (b === 'is' && (chamada.args[2] == null)) filtros.push({ col: String(a), op: 'notnull' });
          else filtros.push({ col: String(a), op: 'neq', valor: chamada.args[2] });
          break;
        case 'or':
          filtros.push({ col: 'or', op: 'or', valor: parseOr(String(a || '')) });
          break;
        case 'overlaps':
          sobreposicoes.push({ col: String(a), valor: Array.isArray(b) ? b : [] });
          break;
        case 'order':
          ordem.push({ col: String(a), asc: (b as { ascending?: boolean } | undefined)?.ascending !== false });
          break;
        case 'limit':
          limite = Number(a);
          break;
        case 'range':
          offset = Number(a);
          limite = Number(b) - Number(a) + 1;
          break;
        case 'single':
          cardinalidade = 'one';
          break;
        case 'maybeSingle':
          cardinalidade = 'maybe';
          break;
        default:
          break;
      }
    }

    if (soContagem) {
      const dados = await postLocal({ tabela: this.tabela === 'v_tarefas_completo' ? 'tarefas' : this.tabela, op: 'count', filtros });
      return { data: null, error: null, count: Number(dados.total || 0) };
    }

    if (acao === 'select') {
      const bruto = this.tabela === 'v_tarefas_completo'
        ? await tarefasCompletas(filtros, ordem, limite)
        : await consultar(this.tabela, filtros, ordem, limite, offset);
      const campos = parseCampos(select);
      const hidratadas = await hidratar(this.tabela, bruto, campos);
      const linhas = hidratadas.map((linha) => projetarCampos(linha, campos)).filter((linha) => sobreposicoes.every((filtro) => {
        const valor = linha[filtro.col];
        const lista = Array.isArray(valor) ? valor.map((item) => String(item)) : [];
        return filtro.valor.some((item) => lista.includes(String(item)));
      }));
      const resultado = finalizar(linhas, cardinalidade);
      return resultado;
    }

    const resposta = await postLocal({
      tabela: this.tabela,
      op: acao,
      dados: payload && typeof payload === 'object' ? payload : {},
      filtros,
      chaves: conflito ? conflito.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
    });
    let linhas = Array.isArray(resposta.dados)
      ? (resposta.dados as Record<string, unknown>[])
      : resposta.dados
        ? [resposta.dados as Record<string, unknown>]
        : [];
    if (pediuSelect) {
      const campos = parseCampos(select);
      linhas = await hidratar(this.tabela, linhas, campos);
      linhas = linhas.map((linha) => projetarCampos(linha, campos));
    }
    if (!pediuSelect && acao === 'delete') return { data: null, error: null };
    return finalizar(linhas, cardinalidade);
  }
}

export async function usuarioDaSessao() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export const dados = {
  from(tabela: string) {
    return new Consulta(tabela);
  },
};
