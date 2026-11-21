#!/usr/bin/env bash
# Ortus (demonstração) — implanta ou atualiza nesta VPS, sem tocar nos outros sistemas.
#
#   bash implantar.sh <pasta-do-envio> [etapa]
#
# Etapas, na ordem de "tudo": codigo, env, build, nginx, certificado, servicos, rotinas, tldr.
# A pasta do envio traz ortus.tar.gz (git archive do commit), ambiente.tar.gz
# (o ambiente de teste), senha-demo.txt (só na primeira vez) e tldr/index.html.
#
# Os segredos (JWT, R2, CRON) são gerados aqui, uma vez, direto para
# /etc/ortus-demo/*.env (dono root, grupo ortusdemo, 0640). Nada disso é impresso.
set -euo pipefail
umask 022

ENVIO="$(cd "${1:?uso: bash implantar.sh <pasta-do-envio> [etapa]}" && pwd)"
ETAPA="${2:-tudo}"
APP=/opt/ortus-demo
ETC=/etc/ortus-demo
SITE=ortus.trinityforce.duckdns.org
API="api.$SITE"
TLDR="tldr.$SITE"
VPS="$APP/_ambiente-teste/vps"

passo() { printf '\n== %s\n' "$*"; }
quer() { [[ "$ETAPA" == tudo || "$ETAPA" == "$1" ]]; }

if quer codigo; then
  passo "usuário e pastas"
  id ortusdemo >/dev/null 2>&1 || sudo useradd --system --home-dir "$APP" --no-create-home --shell /usr/sbin/nologin ortusdemo
  sudo install -d -o ortusdemo -g ortusdemo -m 0750 "$APP"
  sudo install -d -o root -g ortusdemo -m 0750 "$ETC"
  sudo install -d -o root -g root -m 0755 /var/www/ortus-tldr

  passo "código"
  sudo systemctl stop ortus-demo-web.service ortus-demo-api.service 2>/dev/null || true
  sudo rm -rf "$APP/ortus" "$APP/_ambiente-teste"
  sudo -u ortusdemo tar -xzf "$ENVIO/ortus.tar.gz" -C "$APP"
  sudo -u ortusdemo tar -xzf "$ENVIO/ambiente.tar.gz" -C "$APP"

  passo "dependências (sem scripts de instalação: nada nativo é compilado)"
  sudo -u ortusdemo -H bash -c "cd '$APP/_ambiente-teste' && npm ci --omit=dev --no-audit --no-fund --loglevel=error"
  sudo -u ortusdemo -H bash -c "cd '$APP/ortus' && npm ci --ignore-scripts --include=dev --no-audit --no-fund --loglevel=error"
fi

if quer env; then
  passo "arquivos de ambiente"
  if ! sudo test -f "$ETC/api.env"; then
    [[ -s "$ENVIO/senha-demo.txt" ]] || { echo "falta senha-demo.txt no envio"; exit 1; }
    jwt="$(openssl rand -hex 32)"
    s3c="demo$(openssl rand -hex 6)"
    s3s="$(openssl rand -hex 32)"
    senha="$(tr -d '\r\n' < "$ENVIO/senha-demo.txt")"
    sudo tee "$ETC/api.env" > /dev/null <<EOF
PORTA=3461
BASE_PUBLICA=https://$API
APP_URL=https://$SITE
DEMO_PUBLICA=1
IPS_INTERNOS=127.,10.,144.22.246.90
LIMITE_OBJETOS_MB=200
SEGREDO_JWT=$jwt
SENHA_DEMO=$senha
S3_CHAVE_DEMO=$s3c
S3_SEGREDO_DEMO=$s3s
EOF
    sudo tee "$ETC/web.env" > /dev/null <<EOF
PORT=3460
NEXT_PUBLIC_APP_URL=https://$SITE
NEXT_PUBLIC_SUPABASE_URL=https://$API
CRON_SECRET=$(openssl rand -hex 32)
RESEND_API_KEY=re_demo_$(openssl rand -hex 12)
RESEND_FROM_EMAIL="Ortus <nao-responda@ortus.test>"
ALERTA_EMAILS=alertas@ortus.test
R2_ACCOUNT_ID=demo
R2_ACCESS_KEY_ID=$s3c
R2_SECRET_ACCESS_KEY=$s3s
R2_BUCKET_PUBLICO=ortus-publico
R2_BUCKET_PRIVADO=ortus-privado
PAGAMENTO_PROVEDOR=mercadopago
MERCADOPAGO_ACCESS_TOKEN=TEST-token-local-0001
MERCADOPAGO_WEBHOOK_SECRET=segredo-do-webhook-local
MERCADOPAGO_ACEITAR_TESTE=1
ORTUS_HOMOLOGACAO=1
ORTUS_TESTE_URL_RESEND=http://127.0.0.1:3461/resend
ORTUS_TESTE_URL_R2=https://$API/s3
ORTUS_TESTE_URL_PAGAMENTO=http://127.0.0.1:3461/provedor
NEXT_PUBLIC_WHATSAPP_ATIVO=0
NEXT_PUBLIC_SUPORTE_WHATSAPP_1=
NEXT_PUBLIC_SUPORTE_WHATSAPP_2=
EOF
    # As duas chaves do Supabase falso, assinadas com o segredo acima (pela entrada do ambiente, não pela linha de comando).
    SEGREDO_JWT="$jwt" sudo --preserve-env=SEGREDO_JWT -u ortusdemo /usr/bin/node "$APP/_ambiente-teste/chaves.mjs" | sudo tee -a "$ETC/web.env" > /dev/null
    unset jwt s3c s3s senha
  fi
  # Variáveis que chegaram depois da primeira instalação: entram só as que faltam.
  garantir() { sudo grep -q "^$1=" "$ETC/web.env" || echo "$1=$2" | sudo tee -a "$ETC/web.env" > /dev/null; }
  garantir ORTUS_TESTE_URL_GOOGLE "http://127.0.0.1:3461/google"
  garantir ORTUS_TESTE_URL_GOOGLE_PUBLICA "https://$API/google"
  if ! sudo grep -q '^ORTUS_CHAVE_CIFRA=' "$ETC/web.env"; then
    echo "ORTUS_CHAVE_CIFRA=$(openssl rand -hex 32)" | sudo tee -a "$ETC/web.env" > /dev/null
  fi
  sudo chown root:ortusdemo "$ETC/api.env" "$ETC/web.env"
  sudo chmod 0640 "$ETC/api.env" "$ETC/web.env"
  rm -f "$ENVIO/senha-demo.txt"
  echo "ok (valores não impressos)"
fi

if quer build; then
  passo "build de produção (alguns minutos; CPU e memória com teto)"
  sudo systemd-run --quiet --pipe --wait --collect \
    --uid=ortusdemo --gid=ortusdemo \
    --working-directory="$APP/ortus" \
    -p EnvironmentFile="$ETC/web.env" -p Nice=10 -p MemoryMax=3500M -p CPUQuota=150% \
    --setenv=NEXT_TELEMETRY_DISABLED=1 --setenv=HOME="$APP" \
    /usr/bin/node "$APP/ortus/node_modules/next/dist/bin/next" build
fi

if quer nginx; then
  passo "nginx (porta 80; o certbot acrescenta o HTTPS)"
  sudo install -o root -g root -m 0644 "$VPS/ortus-demo-limites.conf" /etc/nginx/conf.d/ortus-demo-limites.conf
  # Depois do certbot o arquivo é dele: não sobrescrever (perderia o HTTPS).
  if ! sudo grep -qs "managed by Certbot" /etc/nginx/sites-available/ortus-demo; then
    sudo install -o root -g root -m 0644 "$VPS/ortus-demo.nginx" /etc/nginx/sites-available/ortus-demo
  fi
  sudo ln -sfn /etc/nginx/sites-available/ortus-demo /etc/nginx/sites-enabled/ortus-demo
  if ! sudo nginx -t; then
    # Nunca deixar o Nginx dos outros sites com configuração quebrada.
    sudo rm -f /etc/nginx/sites-enabled/ortus-demo /etc/nginx/conf.d/ortus-demo-limites.conf
    echo "nginx -t falhou: os arquivos da demonstração foram retirados"
    exit 1
  fi
  sudo systemctl reload nginx
fi

if quer certificado; then
  passo "certificado (Let's Encrypt, um para os três nomes)"
  sudo certbot --nginx --non-interactive --redirect --cert-name "$SITE" -d "$SITE" -d "$API" -d "$TLDR"
  sudo nginx -t
  sudo systemctl reload nginx
fi

if quer servicos; then
  passo "serviços"
  for u in ortus-demo-api.service ortus-demo-web.service ortus-demo-rotinas.service ortus-demo-rotinas.timer ortus-demo-rapida.service ortus-demo-rapida.timer ortus-demo-vigia.service ortus-demo-vigia.timer; do
    sudo install -o root -g root -m 0644 "$VPS/$u" "/etc/systemd/system/$u"
  done
  sudo systemctl daemon-reload
  sudo systemctl enable ortus-demo-api.service ortus-demo-web.service ortus-demo-rotinas.timer ortus-demo-rapida.timer ortus-demo-vigia.timer > /dev/null 2>&1
  sudo systemctl restart ortus-demo-api.service
  for _ in $(seq 1 180); do curl -s -o /dev/null http://127.0.0.1:3461/caixa && break; sleep 1; done
  sudo systemctl restart ortus-demo-web.service
  for _ in $(seq 1 90); do curl -s -o /dev/null http://127.0.0.1:3460/login && break; sleep 1; done
  sudo systemctl restart ortus-demo-rotinas.timer ortus-demo-rapida.timer ortus-demo-vigia.timer
  systemctl is-active ortus-demo-api.service ortus-demo-web.service ortus-demo-rotinas.timer ortus-demo-rapida.timer ortus-demo-vigia.timer
fi

if quer rotinas; then
  passo "rotinas (uma vez agora; depois diárias às 09:00 UTC, rápida a cada 2 min e vigia a cada 15 min)"
  sudo systemctl start ortus-demo-rotinas.service
  # A rápida e o vigia também já, nessa ordem: o banco da demo acabou de nascer
  # e o vigia confere o batimento das outras.
  sudo systemctl start ortus-demo-rapida.service ortus-demo-vigia.service
  sudo journalctl -u ortus-demo-rotinas.service -u ortus-demo-rapida.service -u ortus-demo-vigia.service -n 12 --no-pager -o cat | grep -E "^rotina=" || true
fi

if quer tldr; then
  if [[ -f "$ENVIO/tldr/index.html" ]]; then
    passo "página tl;dr"
    sudo install -o root -g root -m 0644 "$ENVIO/tldr/index.html" /var/www/ortus-tldr/index.html
  fi
fi

passo "pronto"
