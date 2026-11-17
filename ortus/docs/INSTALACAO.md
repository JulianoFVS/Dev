# Instalação do Ortus

Existem quatro formas de usar o sistema. Escolha pelo ambiente da clínica.

| Forma | Para quem | Precisa instalar? |
|---|---|---|
| **Site (navegador)** | quem só quer acessar de qualquer lugar | não |
| **App Windows** | computador da recepção/consultório (alvo principal) | sim (`.exe`) |
| **App macOS** | consultório com Mac | sim (`.dmg`) |
| **App Linux** | máquinas Linux | sim (AppImage/.deb) |

> O app é o recomendado para o dia a dia: ele funciona **sem internet** e faz
> backup automático. O site depende da conexão.

---

## 1. Site no navegador (nada a instalar)

1. Abra `https://ortus.digital`.
2. Entre com o e-mail e a senha da clínica.
3. Se a conta tiver mais de uma unidade, escolha a clínica.

**Limitação:** sem internet não abre. Sem tela de sincronização.

---

## 2. App Windows (`.exe`)

### O que você recebe
`Ortus-Setup-<versão>.exe` (≈360 MB, gerado pela máquina de build ou pelo
GitHub Actions).

### Instalação

1. **Copie o `.exe`** para a máquina da clínica (pendrive, rede interna ou
   download).
2. Dê **duplo clique**. O Windows vai mostrar *"O Windows protegeu o seu PC"*.
   - Clique em **Mais informações** → **Executar assim mesmo**.
   - Isso acontece porque o instalador ainda não tem assinatura digital
     (certificado EV). O app é o mesmo que você gerou.
3. No assistente:
   - **Destino:** deixe o padrão (`%LOCALAPPDATA%\Programs\Ortus`) ou escolha
     outra pasta. **Não é preciso ser administrador.**
   - Marque **Criar atalho na área de trabalho**.
   - **Instalar**.
4. Ao terminar, o Ortus abre sozinho (e fica no menu Iniciar como **Ortus**).

### Primeiro acesso

1. **Ligue a internet** (o primeiro login sempre exige).
2. Entre com **e-mail e senha** da clínica.
3. O app baixa a clínica inteira para o computador. O indicador no canto
   inferior direito mostra **"Sincronizando"** e depois **"Sincronizado"**.
   - Só libere o uso depois de aparecer **Sincronizado**.
4. Se for trocar a senha temporária, o app pede antes de abrir.

### Conectar o WhatsApp

1. Aba **WhatsApp** no menu.
2. Clique em **Conectar** e leia o **QR Code** com o celular da clínica
   (WhatsApp → Dispositivos conectados → Conectar dispositivo).
3. Depois de conectar, a sessão fica salva: fechar o Ortus **não** desconecta.

### Atualizar

Rode o instalador novo por cima. Os dados em `%APPDATA%\Ortus` são preservados
(banco, fotos, sessão do WhatsApp).

### Desinstalar

**Configurações → Aplicativos → Ortus → Desinstalar.**
Os dados **permanecem** em `%APPDATA%\Ortus`. Para apagar de vez, exclua essa
pasta (o backup na nuvem continua no Supabase).

### Requisitos

- Windows 10/11, 64 bits
- ~1,2 GB de espaço livre
- 4 GB de RAM

---

## 3. App macOS (`.dmg`)

### Instalação

1. Abra `Ortus-<versão>-arm64.dmg` (Apple Silicon) ou `-x64.dmg` (Intel).
2. **Arraste o Ortus** para a pasta **Aplicativos**.
3. Na primeira abertura, **clique com o botão direito → Abrir** → **Abrir**.
   - Se preferir pelo Terminal:
     `xattr -dr com.apple.quarantine /Applications/Ortus.app`
4. Primeiro acesso e WhatsApp: **iguais aos do Windows** (seção anterior).

### Onde ficam os dados
`~/Library/Application Support/Ortus` — banco, fotos, sessão do WhatsApp,
segredos e logs.

### Atualizar / desinstalar
Substitua o `Ortus.app` por uma versão nova (os dados ficam fora do app).
Para desinstalar, arraste o app para a lixeira; apague a pasta de dados se
quiser remover tudo.

### Requisitos
macOS 12+, 1,2 GB livres.

---

## 4. App Linux

### AppImage (não precisa instalar)

```bash
chmod +x Ortus-<versão>-x64.AppImage
./Ortus-<versão>-x64.AppImage
```

### .deb (Debian/Ubuntu)

```bash
sudo dpkg -i ortus_<versão>_amd64.deb
ortus
```

### Observações
- Se aparecer erro de *sandbox*, rode com `--no-sandbox`.
- Os dados ficam em `~/.config/Ortus`.
- O Chromium embutido exige as bibliotecas padrão de GUI (`libgtk-3`, `libnss3`).

---

## 5. Modo desenvolvimento (para quem mexe no código)

```bash
npm install
npm --prefix services/whatsapp ci
node scripts/desktop-chromium.mjs --atual
npm run desktop        # abre o shell Electron com hot reload
```

> Se o terminal tiver `ELECTRON_RUN_AS_NODE=1` definido, use
> `env -u ELECTRON_RUN_AS_NODE npm run desktop`.

Dados ficam em uma pasta separada (`OrtusDesktopDev`) para não misturar com uma
instalação real.

---

## 6. Gerar os instaladores

Rode **no sistema do alvo** (o `.exe` só sai no Windows ou no CI):

```bash
# 1. variáveis públicas do Supabase
export NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 2. dependências do WhatsApp + Chromium da plataforma
npm --prefix services/whatsapp ci
node scripts/desktop-chromium.mjs

# 3. build + empacotamento
npm run desktop:mac      # .dmg + .zip
npm run desktop:win      # .exe NSIS
npm run desktop:linux    # AppImage + .deb
```

Sem nuvem, o atalho é o workflow **Ortus Desktop (Windows)** no GitHub Actions
(`.github/workflows/desktop-windows.yml`) — configure os dois secrets públicos
no repositório.

---

## 7. Várias máquinas na mesma clínica

Pode instalar em quantos computadores quiser. **Cada máquina tem o seu banco
local**, e todas conversam com o mesmo Supabase.

- O que uma máquina faz **chega nas outras** em ~5 segundos (com internet).
- Sem internet, cada uma trabalha sozinha e envia quando a conexão voltar.
- Exclusões feitas em uma máquina **chegam às outras** (não ressuscitam).
- Se duas pessoas editarem **o mesmo registro** ao mesmo tempo, a versão mais
  nova (carimbada pelo servidor) vence e a outra fica em
  **Configurações → Sincronização** para você decidir — nada é apagado em
  silêncio.

Detalhes técnicos ficam em [`desktop/README.md`](../desktop/README.md).

---

## 8. Checklist depois de instalar

- [ ] Login feito com internet
- [ ] Indicador mostra **Sincronizado**
- [ ] Um paciente de teste aparece no Supabase
- [ ] Aba WhatsApp conectada pelo QR
- [ ] Mensagem de teste enviada
- [ ] Fechou e abriu o app: WhatsApp continua conectado
- [ ] Desligou a internet: agenda e pacientes continuam abrindo

---

## 9. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Windows bloqueia o instalador | *Mais informações → Executar assim mesmo* |
| macOS diz que o app "não pode ser aberto" | botão direito → Abrir, ou `xattr -dr com.apple.quarantine /Applications/Ortus.app` |
| Tela "Entre para sincronizar" e não sai | conecte a internet e entre novamente |
| WhatsApp não abre o QR | aba WhatsApp → **Desconectar** → conectar de novo |
| App abre e fecha na hora | verifique `%APPDATA%\Ortus\logs\ortus.log` (ou `~/Library/Application Support/Ortus/logs/ortus.log`) |
| Muitos conflitos | duas pessoas editando os mesmos registros; ver a tela de Sincronização |
| Instalador não foi gerado | rode no Windows/CI: o macOS não monta NSIS sem wine |
