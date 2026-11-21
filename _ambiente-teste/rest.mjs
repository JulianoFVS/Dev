// Mini PostgREST: traduz as chamadas do supabase-js em SQL e executa no papel
// do chamador (anon / authenticated / service_role), com as claims do JWT.
// Quem decide o que cada um vê é a RLS do Postgres, não este arquivo.
// Cobre o subconjunto que o Ortus usa: select com junções por FK, filtros,
// or(), ordenação, paginação, contagem, insert/upsert/update/delete e rpc.

const q = (nome) => `"${String(nome).replace(/"/g, '""')}"`;

export class Rest {
  constructor(executar) {
    /** executar(claims, fn(db)) — roda fn numa transação com o papel aplicado. */
    this.executar = executar;
    this.fks = null;
    this.tipos = null;
    this.pks = null;
  }

  /** Recarrega o catálogo (FKs, tipos de coluna, PKs). Chamar após DDL. */
  async carregarCatalogo(db) {
    const fks = await db.query(`
      SELECT c.conrelid::regclass::text AS de, a.attname AS col,
             c.confrelid::regclass::text AS para, af.attname AS refcol
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public' AND array_length(c.conkey, 1) = 1`);
    this.fks = fks.rows.map((r) => ({ ...r, de: r.de.replace(/^public\./, '').replace(/"/g, ''), para: r.para.replace(/^public\./, '').replace(/"/g, '') }));
    const cols = await db.query(`
      SELECT c.relname AS tabela, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS tipo
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'v', 'p')`);
    this.tipos = {};
    for (const r of cols.rows) (this.tipos[r.tabela] ||= {})[r.col] = r.tipo;
  }

  tipo(tabela, col) {
    const t = this.tipos?.[tabela]?.[col];
    if (!t) throw erro(400, '42703', `column ${tabela}.${col} does not exist`);
    return t;
  }

  // ---------------- select ----------------
  static parseSelect(texto) {
    const campos = [];
    const s = (texto || '*').trim();
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i += 1;
      if (i >= s.length) break;
      let nome = '';
      while (i < s.length && /[\w*:!.]/.test(s[i])) { nome += s[i]; i += 1; }
      if (!nome) { i += 1; continue; }
      if (s[i] === '(') {
        let nivel = 1;
        const ini = i + 1;
        i += 1;
        while (i < s.length && nivel > 0) { if (s[i] === '(') nivel += 1; else if (s[i] === ')') nivel -= 1; i += 1; }
        const [alias, alvo] = nome.includes(':') ? nome.split(':') : [null, nome];
        campos.push({ embed: alvo.split('!')[0], alias: alias || alvo.split('!')[0], campos: Rest.parseSelect(s.slice(ini, i - 1)) });
      } else {
        campos.push({ col: nome });
      }
    }
    return campos;
  }

  listaSelect(tabela, campos, alias, prof = 0) {
    const partes = [];
    for (const c of campos) {
      if (c.col) {
        if (c.col === '*') partes.push(`${alias}.*`);
        else { this.tipo(tabela, c.col); partes.push(`${alias}.${q(c.col)}`); }
        continue;
      }
      const filho = `e${prof}_${partes.length}`;
      const m2o = this.fks.find((f) => f.de === tabela && f.para === c.embed);
      const o2m = this.fks.find((f) => f.de === c.embed && f.para === tabela);
      if (!m2o && !o2m) throw erro(400, 'PGRST200', `Could not find a relationship between '${tabela}' and '${c.embed}' in the schema cache`);
      const sub = this.listaSelect(c.embed, c.campos.length ? c.campos : [{ col: '*' }], filho, prof + 1);
      if (m2o) {
        partes.push(`(SELECT row_to_json(x) FROM (SELECT ${sub} FROM public.${q(c.embed)} AS ${filho} WHERE ${filho}.${q(m2o.refcol)} = ${alias}.${q(m2o.col)} LIMIT 1) x) AS ${q(c.alias)}`);
      } else {
        partes.push(`(SELECT coalesce(json_agg(row_to_json(x)), '[]'::json) FROM (SELECT ${sub} FROM public.${q(c.embed)} AS ${filho} WHERE ${filho}.${q(o2m.col)} = ${alias}.${q(o2m.refcol)}) x) AS ${q(c.alias)}`);
      }
    }
    return partes.length ? partes.join(', ') : `${alias}.*`;
  }

  // ---------------- filtros ----------------
  static splitTopo(texto) {
    const partes = [];
    let atual = '';
    let nivel = 0;
    let aspas = false;
    for (const ch of texto) {
      if (ch === '"') aspas = !aspas;
      if (!aspas && (ch === '(' || ch === '{')) nivel += 1;
      if (!aspas && (ch === ')' || ch === '}')) nivel -= 1;
      if (ch === ',' && nivel === 0 && !aspas) { partes.push(atual); atual = ''; continue; }
      atual += ch;
    }
    if (atual) partes.push(atual);
    return partes;
  }

  static itensLista(texto) {
    return Rest.splitTopo(texto).map((v) => {
      const t = v.trim();
      return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\"/g, '"') : t;
    });
  }

  static arrayLiteral(itens) {
    return `{${itens.map((v) => (v === null ? 'NULL' : `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)).join(',')}}`;
  }

  condicao(tabela, alias, col, expr, params) {
    let negado = false;
    let resto = expr;
    if (resto.startsWith('not.')) { negado = true; resto = resto.slice(4); }
    const ponto = resto.indexOf('.');
    const op = ponto < 0 ? resto : resto.slice(0, ponto);
    const valor = ponto < 0 ? '' : resto.slice(ponto + 1);
    const tipo = this.tipo(tabela, col);
    const campo = `${alias}.${q(col)}`;
    const p = (v, cast = tipo) => { params.push(v); return `$${params.length}::${cast}`; };
    let sql;
    switch (op) {
      case 'eq': sql = `${campo} = ${p(valor)}`; break;
      case 'neq': sql = `${campo} <> ${p(valor)}`; break;
      case 'gt': sql = `${campo} > ${p(valor)}`; break;
      case 'gte': sql = `${campo} >= ${p(valor)}`; break;
      case 'lt': sql = `${campo} < ${p(valor)}`; break;
      case 'lte': sql = `${campo} <= ${p(valor)}`; break;
      case 'like': sql = `${campo}::text LIKE ${p(valor.replace(/\*/g, '%'), 'text')}`; break;
      case 'ilike': sql = `${campo}::text ILIKE ${p(valor.replace(/\*/g, '%'), 'text')}`; break;
      case 'is':
        if (valor === 'null') sql = `${campo} IS NULL`;
        else if (valor === 'true') sql = `${campo} IS TRUE`;
        else if (valor === 'false') sql = `${campo} IS FALSE`;
        else throw erro(400, 'PGRST100', `is.${valor} inválido`);
        break;
      case 'in': {
        const itens = Rest.itensLista(valor.replace(/^\(/, '').replace(/\)$/, ''));
        sql = itens.length ? `${campo} = ANY(${p(Rest.arrayLiteral(itens), `${tipo}[]`)})` : 'false';
        break;
      }
      case 'cs': sql = `${campo} @> ${p(valor)}`; break;
      case 'cd': sql = `${campo} <@ ${p(valor)}`; break;
      case 'ov': sql = `${campo} && ${p(valor)}`; break;
      default: throw erro(400, 'PGRST100', `operador ${op} não suportado no ambiente de teste`);
    }
    return negado ? `NOT (${sql})` : sql;
  }

  grupo(tabela, alias, texto, juncao, params) {
    const itens = Rest.splitTopo(texto.replace(/^\(/, '').replace(/\)$/, ''));
    const sqls = itens.map((item) => {
      const t = item.trim();
      const m = t.match(/^(not\.)?(and|or)\((.*)\)$/s);
      if (m) {
        const interno = this.grupo(tabela, alias, m[3], m[2] === 'and' ? ' AND ' : ' OR ', params);
        return m[1] ? `NOT (${interno})` : `(${interno})`;
      }
      const ponto = t.indexOf('.');
      return this.condicao(tabela, alias, t.slice(0, ponto), t.slice(ponto + 1), params);
    });
    return sqls.length ? sqls.join(juncao) : 'true';
  }

  onde(tabela, alias, busca, params) {
    const reservados = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
    const conds = [];
    for (const [chave, valor] of busca) {
      if (reservados.has(chave)) continue;
      if (chave === 'or') conds.push(`(${this.grupo(tabela, alias, valor, ' OR ', params)})`);
      else if (chave === 'and') conds.push(`(${this.grupo(tabela, alias, valor, ' AND ', params)})`);
      else if (chave === 'not.or') conds.push(`NOT (${this.grupo(tabela, alias, valor, ' OR ', params)})`);
      else conds.push(this.condicao(tabela, alias, chave, valor, params));
    }
    return conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  }

  ordem(tabela, alias, texto) {
    if (!texto) return '';
    const itens = texto.split(',').map((item) => {
      const [col, ...mods] = item.trim().split('.');
      this.tipo(tabela, col);
      const dir = mods.includes('desc') ? 'DESC' : 'ASC';
      const nulos = mods.includes('nullsfirst') ? ' NULLS FIRST' : mods.includes('nullslast') ? ' NULLS LAST' : '';
      return `${alias}.${q(col)} ${dir}${nulos}`;
    });
    return `ORDER BY ${itens.join(', ')}`;
  }

  // ---------------- requisição ----------------
  async tratar({ metodo, caminho, busca, cabecalhos, corpo, claims }) {
    const partes = caminho.split('/').filter(Boolean);
    if (partes[0] === 'rpc') return this.rpc(partes[1], corpo, claims, metodo === 'GET' ? busca : null);
    const tabela = decodeURIComponent(partes[0] || '');
    if (!this.tipos?.[tabela]) throw erro(404, 'PGRST205', `Could not find the table 'public.${tabela}' in the schema cache`);

    const prefer = String(cabecalhos.prefer || '');
    const querCount = /count=exact/.test(prefer);
    const querObjeto = String(cabecalhos.accept || '').includes('vnd.pgrst.object');
    const representacao = /return=representation/.test(prefer);
    const campos = Rest.parseSelect(busca.get('select') || '*');
    const params = [];

    const finalizar = (linhas, status, total) => {
      const extra = {};
      if (total != null) extra['content-range'] = `${linhas.length ? `0-${linhas.length - 1}` : '*'}/${total}`;
      if (querObjeto) {
        if (linhas.length !== 1) {
          throw erro(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${linhas.length} rows`);
        }
        return { status, corpo: linhas[0], cabecalhos: extra };
      }
      return { status, corpo: linhas, cabecalhos: extra };
    };

    if (metodo === 'GET' || metodo === 'HEAD') {
      const where = this.onde(tabela, 't0', busca, params);
      const lista = this.listaSelect(tabela, campos, 't0');
      const limite = busca.get('limit');
      const offset = busca.get('offset');
      const faixa = String(cabecalhos.range || '').match(/^(\d+)-(\d*)$/);
      let lim = limite != null ? Number(limite) : null;
      let off = offset != null ? Number(offset) : 0;
      if (faixa) { off = Number(faixa[1]); if (faixa[2] !== '') lim = Number(faixa[2]) - off + 1; }
      const sql = `SELECT coalesce(json_agg(row_to_json(r)), '[]'::json)::text AS j FROM (SELECT ${lista} FROM public.${q(tabela)} AS t0 ${where} ${this.ordem(tabela, 't0', busca.get('order'))} ${lim != null ? `LIMIT ${lim}` : ''} ${off ? `OFFSET ${off}` : ''}) r`;
      return this.executar(claims, async (db) => {
        let total = null;
        if (querCount) total = Number((await db.query(`SELECT count(*)::bigint AS n FROM public.${q(tabela)} AS t0 ${where}`, params)).rows[0].n);
        if (metodo === 'HEAD') return { status: 200, corpo: null, cabecalhos: total != null ? { 'content-range': `*/${total}` } : {} };
        const linhas = JSON.parse((await db.query(sql, params)).rows[0].j);
        return finalizar(linhas, 200, total);
      });
    }

    const retorno = `SELECT coalesce(json_agg(row_to_json(r)), '[]'::json)::text AS j FROM (SELECT ${this.listaSelect(tabela, campos, 't0')} FROM alvo AS t0) r`;

    if (metodo === 'POST') {
      const linhas = Array.isArray(corpo) ? corpo : [corpo || {}];
      const pedidas = busca.get('columns');
      const colunas = pedidas
        ? pedidas.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        : [...new Set(linhas.flatMap((l) => Object.keys(l)))];
      colunas.forEach((c) => this.tipo(tabela, c));
      params.push(JSON.stringify(linhas));
      let conflito = '';
      if (/resolution=merge-duplicates/.test(prefer) || /resolution=ignore-duplicates/.test(prefer)) {
        const alvo = busca.get('on_conflict')
          ? busca.get('on_conflict').split(',').map((c) => q(c.trim())).join(', ')
          : (await this.pk(tabela)).map(q).join(', ');
        const atualiza = colunas.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ');
        conflito = /ignore-duplicates/.test(prefer) || !atualiza ? `ON CONFLICT (${alvo}) DO NOTHING` : `ON CONFLICT (${alvo}) DO UPDATE SET ${atualiza}`;
      }
      const insercao = colunas.length
        ? `INSERT INTO public.${q(tabela)} (${colunas.map(q).join(', ')}) SELECT ${colunas.map(q).join(', ')} FROM jsonb_populate_recordset(NULL::public.${q(tabela)}, $1::jsonb) ${conflito} RETURNING *`
        : `INSERT INTO public.${q(tabela)} DEFAULT VALUES RETURNING *`;
      return this.executar(claims, async (db) => {
        // Como o PostgREST de verdade: com return=minimal a linha não é lida de volta, então a regra de
        // SELECT não pesa (tabela "só grava", como audit_log). O RETURNING fica só para representation.
        if (!representacao) {
          await db.query(insercao.replace(/ RETURNING \*$/, ''), colunas.length ? params : []);
          return { status: 201, corpo: null, cabecalhos: {} };
        }
        const r = await db.query(`WITH alvo AS (${insercao}) ${retorno}`, colunas.length ? params : []);
        return finalizar(JSON.parse(r.rows[0].j), 201, null);
      });
    }

    if (metodo === 'PATCH') {
      const colunas = Object.keys(corpo || {});
      if (!colunas.length) return { status: 204, corpo: null, cabecalhos: {} };
      colunas.forEach((c) => this.tipo(tabela, c));
      params.push(JSON.stringify(corpo));
      const where = this.onde(tabela, 't0', busca, params);
      const sql = `WITH alvo AS (UPDATE public.${q(tabela)} AS t0 SET (${colunas.map(q).join(', ')}) = (SELECT ${colunas.map(q).join(', ')} FROM jsonb_populate_record(NULL::public.${q(tabela)}, $1::jsonb)) ${where} RETURNING t0.*) ${representacao ? retorno : 'SELECT count(*)::text AS j FROM alvo'}`;
      return this.executar(claims, async (db) => {
        const r = await db.query(sql.replace(`SET (${colunas.map(q).join(', ')}) =`, colunas.length === 1 ? `SET ${q(colunas[0])} =` : `SET (${colunas.map(q).join(', ')}) =`), params);
        if (!representacao) return { status: 204, corpo: null, cabecalhos: {} };
        return finalizar(JSON.parse(r.rows[0].j), 200, null);
      });
    }

    if (metodo === 'DELETE') {
      const where = this.onde(tabela, 't0', busca, params);
      const sql = `WITH alvo AS (DELETE FROM public.${q(tabela)} AS t0 ${where} RETURNING t0.*) ${representacao ? retorno : 'SELECT count(*)::text AS j FROM alvo'}`;
      return this.executar(claims, async (db) => {
        const r = await db.query(sql, params);
        if (!representacao) return { status: 204, corpo: null, cabecalhos: {} };
        return finalizar(JSON.parse(r.rows[0].j), 200, null);
      });
    }

    throw erro(405, 'PGRST000', 'Método não suportado');
  }

  async pk(tabela) {
    return this.executar({ role: 'service_role' }, async (db) => {
      const r = await db.query(`
        SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary`, [`public.${q(tabela)}`]);
      return r.rows.map((x) => x.attname);
    });
  }

  async rpc(nome, corpo, claims, busca) {
    const args = busca ? Object.fromEntries(busca) : (corpo || {});
    return this.executar(claims, async (db) => {
      const funcs = await db.query(`
        SELECT p.oid, p.proretset, p.proargnames, p.proargmodes, p.pronargs, p.pronargdefaults,
               format_type(p.prorettype, NULL) AS retorno, t.typtype,
               ARRAY(SELECT format_type(unnest(p.proargtypes), NULL)) AS tipos
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type t ON t.oid = p.prorettype
        WHERE n.nspname = 'public' AND p.proname = $1`, [nome]);
      const chaves = Object.keys(args);
      const f = funcs.rows.find((cand) => {
        const entradas = (cand.proargnames || []).slice(0, cand.pronargs);
        const obrigatorias = entradas.slice(0, cand.pronargs - cand.pronargdefaults);
        return chaves.every((k) => entradas.includes(k)) && obrigatorias.every((k) => chaves.includes(k));
      });
      if (!f) {
        throw erro(404, 'PGRST202', `Could not find the function public.${nome}(${chaves.join(', ')}) in the schema cache`);
      }
      const entradas = (f.proargnames || []).slice(0, f.pronargs);
      const params = [];
      const lista = chaves.map((k) => {
        const tipo = f.tipos[entradas.indexOf(k)];
        const v = args[k];
        let texto;
        if (v === null || v === undefined) texto = null;
        else if (/\[\]$/.test(tipo)) texto = Array.isArray(v) ? Rest.arrayLiteral(v) : String(v);
        else if (/^jsonb?$/.test(tipo)) texto = JSON.stringify(v);
        else if (typeof v === 'object') texto = JSON.stringify(v);
        else texto = String(v);
        params.push(texto);
        return `${q(k)} := $${params.length}::${tipo}`;
      }).join(', ');
      const chamada = `public.${q(nome)}(${lista})`;
      if (f.retorno === 'void') {
        await db.query(`SELECT ${chamada}`, params);
        return { status: 204, corpo: null, cabecalhos: {} };
      }
      const temSaida = (f.proargmodes || []).some((m) => m === 't' || m === 'o');
      if (f.proretset) {
        const r = await db.query(`SELECT coalesce(json_agg(r), '[]'::json)::text AS j FROM ${chamada} AS r`, params);
        return { status: 200, corpo: JSON.parse(r.rows[0].j), cabecalhos: {} };
      }
      if (f.typtype === 'c' || temSaida) {
        const r = await db.query(`SELECT row_to_json(r)::text AS j FROM ${chamada} AS r`, params);
        return { status: 200, corpo: JSON.parse(r.rows[0].j), cabecalhos: {} };
      }
      const r = await db.query(`SELECT to_json(${chamada})::text AS j`, params);
      return { status: 200, corpo: r.rows[0].j == null ? null : JSON.parse(r.rows[0].j), cabecalhos: {} };
    });
  }
}

export function erro(status, code, message, details = null, hint = null) {
  return Object.assign(new Error(message), { http: status, corpo: { code, message, details, hint } });
}

/** Converte um erro do Postgres na resposta que o PostgREST daria. */
export function respostaDeErro(e) {
  if (e?.http) return { status: e.http, corpo: e.corpo };
  const code = e?.code || 'XX000';
  let status = 400;
  if (code === '42501') status = 403;
  else if (code === '23505') status = 409;
  else if (code === '23503') status = 409;
  else if (code === 'P0002') status = 404;
  else if (code.startsWith('42')) status = 400;
  else if (code.startsWith('XX') || code.startsWith('57')) status = 500;
  return { status, corpo: { code, message: e?.message || 'erro', details: e?.detail || null, hint: e?.hint || null } };
}
