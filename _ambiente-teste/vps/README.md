# Demonstração do Ortus na VPS

| Endereço | O que é |
|---|---|
| https://ortus.trinityforce.duckdns.org | o site, build de produção (`next start`, 127.0.0.1:3460) |
| https://api.ortus.trinityforce.duckdns.org | serviços falsos (127.0.0.1:3461): Supabase, R2, Resend, Mercado Pago |
| https://api.ortus.trinityforce.duckdns.org/caixa | caixa de e-mails (só leitura, por endereço) |
| https://tldr.ortus.trinityforce.duckdns.org | página com o resumo das alterações |

Nada sai para a internet: o banco é PGlite em memória e os e-mails, arquivos e
pagamentos ficam no servidor falso. **Reiniciar `ortus-demo-api` volta tudo ao
estado inicial** (as contas de exemplo do `seed.mjs` voltam, o resto some).

A senha das contas de exemplo está em `acesso-demo.txt` (nesta pasta, só no
computador do dono; na VPS fica em `/etc/ortus-demo/api.env`).

## O que existe na VPS (e mais nada)

- usuário de sistema `ortusdemo`; código em `/opt/ortus-demo`
- `/etc/ortus-demo/api.env` e `web.env` (root:ortusdemo, 0640): segredos gerados lá
- unidades `ortus-demo-api`, `ortus-demo-web`, `ortus-demo-rotinas` (+ `.timer`, diário: assinaturas e lembretes), `ortus-demo-rapida` (+ `.timer`, a cada 2 min: Google Agenda e aviso do suporte) e `ortus-demo-vigia` (+ `.timer`, a cada 15 min, para o `/api/saude` não acusar agendador atrasado)
- Nginx: `sites-available/ortus-demo` e `conf.d/ortus-demo-limites.conf`
- certificado `ortus.trinityforce.duckdns.org` (três nomes)
- `/var/www/ortus-tldr/index.html`; logs `/var/log/nginx/ortus-demo*`

## Proteções da demonstração (DEMO_PUBLICA=1)

- `/_teste/*` (SQL, sementes) e `/provedor/_teste/*` não existem (Nginx e servidor).
- E-mail falso, API do pagamento e administração do login só atendem a própria máquina.
- Arquivo: de fora só entra PUT com link assinado de verdade (SigV4, vence em 60 s);
  ler, listar e apagar só pelo site. Teto de 200 MB em memória.
- Caixa de e-mails só mostra a caixa do endereço digitado; as contas de exemplo
  ficam com a caixa fechada (ninguém toma a conta pelo "esqueci a senha").
- Volta do link de e-mail só para o próprio app; Postgres sem socket.
- Limite de 30 pedidos/s por IP (rajada 200–300), `noindex` em tudo.
- Unidades com teto de memória (1,2 GB) e de CPU; o build usa no máximo 1,5 núcleo.

## Atualizar para outro commit

No computador (Git Bash), na pasta `Desktop\Dev`:

```bash
E=/tmp/ortus-demo-envio; rm -rf $E; mkdir -p $E/tldr
git archive --format=tar.gz --prefix=ortus/ -o $E/ortus.tar.gz HEAD:ortus
tar --exclude=node_modules --exclude='*.log' --exclude='*.gerado' --exclude=edicoes \
    --exclude='vps/acesso-demo.txt' --exclude='vps/senha-demo.txt' -czf $E/ambiente.tar.gz _ambiente-teste
cp ortus/docs/alteracoes-18-11-2026.html $E/tldr/index.html
scp -i ~/.ssh/oracle_vps -r $E ubuntu@144.22.246.90:/tmp/
```

Na VPS (`ssh -i ~/.ssh/oracle_vps ubuntu@144.22.246.90`): extrair o
`implantar.sh` do envio e rodar só as etapas `codigo build servicos rotinas
tldr`. Os arquivos de ambiente, o Nginx e o certificado já existem e ficam
como estão:

```bash
tar -xzf /tmp/ortus-demo-envio/ambiente.tar.gz -C /tmp/ortus-demo-envio _ambiente-teste/vps/implantar.sh
for e in codigo build servicos rotinas tldr; do bash /tmp/ortus-demo-envio/_ambiente-teste/vps/implantar.sh /tmp/ortus-demo-envio $e; done
```

## Operação

```bash
sudo systemctl restart ortus-demo-api      # zera a demonstração
sudo journalctl -u ortus-demo-web -n 50    # erros do site
sudo journalctl -u ortus-demo-api -n 50    # erros dos serviços falsos
systemctl list-timers ortus-demo-rotinas.timer ortus-demo-rapida.timer ortus-demo-vigia.timer
```

## Remover tudo

```bash
sudo systemctl disable --now ortus-demo-rotinas.timer ortus-demo-rapida.timer ortus-demo-vigia.timer ortus-demo-web.service ortus-demo-api.service
sudo rm -f /etc/systemd/system/ortus-demo-* && sudo systemctl daemon-reload
sudo rm -f /etc/nginx/sites-enabled/ortus-demo /etc/nginx/sites-available/ortus-demo /etc/nginx/conf.d/ortus-demo-limites.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot delete --cert-name ortus.trinityforce.duckdns.org
sudo rm -rf /opt/ortus-demo /etc/ortus-demo /var/www/ortus-tldr /var/log/nginx/ortus-demo*
sudo userdel ortusdemo
```
