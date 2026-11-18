#!/usr/bin/env bash
#
# Ortus — chama uma rotina agendada do próprio site.
#
# Quem roda: os serviços ortus-lembretes, ortus-assinaturas e ortus-vigia
# (timers do systemd), como usuário `ortus`.
# Instalado em /usr/local/bin/ortus-chamar-rotina (veja docs/ORACLE.md).
#
# Uso:
#   ortus-chamar-rotina <nome> <caminho>
#   ortus-chamar-rotina lembretes '/api/lembretes/processar?enviar=true'
#
# O que faz:
#   1. Lê CRON_SECRET (e PORT) de /etc/ortus/ortus.env. Só essas duas linhas:
#      as outras chaves do arquivo não entram no ambiente deste processo.
#   2. Chama http://127.0.0.1:<PORT><caminho> com
#      `Authorization: Bearer <CRON_SECRET>`.
#   3. Registra o código HTTP, o tempo e um resumo com números e
#      verdadeiro/falso da resposta. O corpo nunca é impresso, e nenhum texto
#      da resposta entra no resumo (nome, telefone e e-mail são texto).
#   4. Sai com 0 se a resposta foi 2xx e com outro código se não foi.
#
# Por que o segredo vai por `curl --config -` (entrada padrão) e não por
# `-H "Authorization: ..."`: os argumentos de um processo ficam visíveis para
# qualquer usuário da máquina em `ps` e em /proc/<pid>/cmdline enquanto ele
# roda, e o systemd grava a linha de comando no journal quando o serviço
# falha. O que entra pela entrada padrão não aparece em nenhum dos dois.
# O `printf` usado aqui é interno do bash: não cria processo com o segredo
# nos argumentos. Não ligue `set -x` neste arquivo.
#
# Ajustes pelo ambiente (a unidade do systemd define os que precisa):
#   ROTINA_TEMPO_MAX     segundos por chamada (padrão 120)
#   ROTINA_REPETICOES    quantas chamadas no máximo enquanto a resposta
#                        trouxer "interrompido_por_tempo": true (padrão 1)
#   ROTINA_ESPERA_SITE   segundos esperando o site abrir a porta (padrão 60)
#   ORTUS_ENV_FILE       outro arquivo de ambiente (para teste)
#
# Códigos de saída:
#   0  resposta 2xx
#   1  resposta fora de 2xx (401, 500, 503...)
#   2  uso errado ou configuração faltando
#   3  o site não respondeu (fora do ar, porta errada ou tempo esgotado)

set -uo pipefail
umask 077

ARQUIVO_ENV="${ORTUS_ENV_FILE:-/etc/ortus/ortus.env}"
TEMPO_MAX="${ROTINA_TEMPO_MAX:-120}"
REPETICOES="${ROTINA_REPETICOES:-1}"
ESPERA_SITE="${ROTINA_ESPERA_SITE:-60}"

nome="${1:-}"
caminho="${2:-}"

avisar() {
  builtin printf 'rotina=%s %s\n' "${nome:-?}" "$*" >&2
}

if [[ ! "$nome" =~ ^[a-z0-9_-]{1,40}$ ]] || [[ ! "$caminho" =~ ^/api/[A-Za-z0-9/_.?=\&-]{1,200}$ ]]; then
  nome="${nome:-?}"
  avisar "ERRO de uso. Exemplo: ortus-chamar-rotina lembretes '/api/lembretes/processar?enviar=true'"
  exit 2
fi

for numero in "$TEMPO_MAX" "$REPETICOES" "$ESPERA_SITE"; do
  if [[ ! "$numero" =~ ^[0-9]{1,5}$ ]]; then
    avisar "ERRO: ROTINA_TEMPO_MAX, ROTINA_REPETICOES e ROTINA_ESPERA_SITE têm que ser números inteiros."
    exit 2
  fi
done
(( REPETICOES >= 1 )) || REPETICOES=1

if [[ ! -r "$ARQUIVO_ENV" ]]; then
  avisar "ERRO: não consigo ler $ARQUIVO_ENV. Rode como usuário ortus e confira dono root, grupo ortus, modo 0640."
  exit 2
fi

# Valor de uma variável do arquivo de ambiente. Vale a última ocorrência.
# Tira espaços das pontas, o \r de arquivo salvo no Windows e um par de aspas
# em volta — o mesmo valor que o systemd entrega ao site para um valor simples.
ler_variavel() {
  local linha valor
  linha="$(grep -E "^[[:space:]]*$1=" "$ARQUIVO_ENV" | tail -n 1)"
  valor="${linha#*=}"
  valor="${valor%$'\r'}"
  valor="${valor#"${valor%%[![:space:]]*}"}"
  valor="${valor%"${valor##*[![:space:]]}"}"
  if (( ${#valor} >= 2 )); then
    if [[ "$valor" == \"*\" || "$valor" == \'*\' ]]; then
      valor="${valor:1:${#valor}-2}"
    fi
  fi
  builtin printf '%s' "$valor"
}

segredo="$(ler_variavel CRON_SECRET)"
if [[ -z "$segredo" ]]; then
  avisar "ERRO: CRON_SECRET está vazio em $ARQUIVO_ENV. Sem ele a rota responde 401."
  exit 2
fi
# Só caracteres que não precisam de escape no arquivo de configuração do curl.
if [[ ! "$segredo" =~ ^[A-Za-z0-9._~+/=-]+$ ]]; then
  avisar "ERRO: CRON_SECRET tem caractere que este script não aceita. Gere outro com: openssl rand -hex 32"
  exit 2
fi

porta="$(ler_variavel PORT)"
porta="${porta:-3500}"
if [[ ! "$porta" =~ ^[0-9]{2,5}$ ]]; then
  avisar "ERRO: PORT inválida em $ARQUIVO_ENV."
  exit 2
fi

corpo="$(mktemp)" || { avisar "ERRO: não consegui criar arquivo temporário."; exit 2; }
trap 'rm -f "$corpo"' EXIT

# Logo depois do boot o timer pode disparar antes de o site abrir a porta.
esperar_site() {
  local limite=$(( SECONDS + ESPERA_SITE ))
  while :; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$porta") 2>/dev/null; then
      return 0
    fi
    (( SECONDS >= limite )) && return 1
    sleep 2
  done
}

# Resumo da resposta: só números e verdadeiro/falso, até dois níveis, e o
# tamanho das listas. Saída: "<sim|nao><TAB><resumo>", onde sim = a rotina
# avisou que parou por tempo e ainda tem o que fazer.
resumir() {
  if ! command -v node >/dev/null 2>&1; then
    builtin printf 'nao\t(sem node para resumir)'
    return 0
  fi
  node -e '
    const fs = require("fs");
    let dados;
    try {
      dados = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    } catch {
      process.stdout.write("nao\t(corpo não é JSON)");
      process.exit(0);
    }
    const simples = (v) => typeof v === "number" || typeof v === "boolean";
    const chaveBoa = (k) => /^[A-Za-z0-9_]{1,40}$/.test(k);
    const itens = [];
    if (dados && typeof dados === "object" && !Array.isArray(dados)) {
      for (const [k, v] of Object.entries(dados)) {
        if (!chaveBoa(k)) continue;
        if (simples(v)) itens.push(k + "=" + v);
        else if (Array.isArray(v)) itens.push(k + "[]=" + v.length);
        else if (v && typeof v === "object") {
          for (const [k2, v2] of Object.entries(v)) {
            if (chaveBoa(k2) && simples(v2)) itens.push(k + "." + k2 + "=" + v2);
          }
        }
      }
    }
    const continua = Boolean(dados) && dados.interrompido_por_tempo === true;
    const texto = itens.slice(0, 40).join(" ").slice(0, 600);
    process.stdout.write((continua ? "sim" : "nao") + "\t" + (texto || "(sem números na resposta)"));
  ' "$1" 2>/dev/null || builtin printf 'nao\t(não consegui resumir)'
}

if ! esperar_site; then
  avisar "ERRO: nada escutando em 127.0.0.1:$porta depois de ${ESPERA_SITE}s. Veja: systemctl status ortus"
  exit 3
fi

chamada=0
continua="nao"
while :; do
  chamada=$(( chamada + 1 ))
  : > "$corpo"

  saida="$(
    builtin printf 'header = "Authorization: Bearer %s"\n' "$segredo" |
      curl --config - \
        --silent --show-error \
        --noproxy '*' \
        --connect-timeout 5 \
        --max-time "$TEMPO_MAX" \
        --header 'Accept: application/json' \
        --user-agent 'ortus-chamar-rotina' \
        --output "$corpo" \
        --write-out '%{http_code} %{time_total}' \
        "http://127.0.0.1:${porta}${caminho}"
  )"
  falha_curl=$?

  codigo="${saida%% *}"
  tempo="${saida#* }"

  if (( falha_curl != 0 )); then
    avisar "chamada=$chamada ERRO: o site não respondeu (curl saiu com $falha_curl). Veja: journalctl -u ortus -n 50"
    exit 3
  fi

  bytes="$(wc -c < "$corpo" | tr -d '[:space:]')"
  resultado="$(resumir "$corpo")"
  continua="${resultado%%$'\t'*}"
  resumo="${resultado#*$'\t'}"

  builtin printf 'rotina=%s chamada=%s http=%s tempo=%ss bytes=%s resumo: %s\n' \
    "$nome" "$chamada" "$codigo" "$tempo" "$bytes" "$resumo"

  if [[ ! "$codigo" =~ ^2[0-9][0-9]$ ]]; then
    avisar "FALHA: resposta HTTP $codigo. O motivo, já sem dado pessoal, fica no log do site: journalctl -u ortus -n 50"
    exit 1
  fi

  if [[ "$continua" != "sim" ]] || (( chamada >= REPETICOES )); then
    break
  fi
  sleep 2
done

if [[ "$continua" == "sim" ]]; then
  avisar "AVISO: depois de $chamada chamada(s) a rotina ainda parou por tempo. O que sobrou fica para a próxima execução."
fi

exit 0
