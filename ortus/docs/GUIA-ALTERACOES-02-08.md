# Ortus — Guia das Alterações (PDF 02.08)

**Data de entrega:** 3 de agosto de 2026  
**Commits:** `1108d30` (implementação principal) · `20f9f2a` (gaps + polish)  
**Repositório:** github.com/JulianoFVS/Dev  
**Escopo:** Itens do PDF *ortus - alterações 02.08* até a seção **OBSERVAÇÕES** (itens de análise interna foram ignorados conforme combinado).

---

## 1. Resumo executivo

Foram entregues **37 arquivos alterados** (+3.599 / −2.047 linhas) cobrindo:

| Área | Principais mudanças |
|------|---------------------|
| **Infraestrutura** | Componente `Modal` com portal e backdrop; middleware de rotas; cookies de permissão |
| **Pacientes** | Clique abre ficha direto; atalhos WhatsApp / Agendar / Nova Prótese |
| **Débitos** | Pagamento pendente na agenda e prontuário; débito manual na aba Débitos |
| **Agenda** | Filtro especialidade → procedimento; autocomplete; sem criar serviço na agenda |
| **Prontuário** | Anamnese com tags; medicamentos com autocomplete; Tratamentos e Evoluções unificados |
| **Planos** | Lógica simplificada; movidos para Contratos & Docs; plano Particular fixo |
| **Configurações** | Aba Geral primeiro; cor do tema; taxas por parcela e bandeira |
| **Financeiro / Relatórios** | Restore corrigido; categorias nos relatórios; filtros enriquecidos |
| **UI global** | `CustomSelect` em todo o sistema; tema visual configurável |

---

## 2. Onde encontrar cada alteração

### 2.1 Modais (fundo cinza full-screen)

| Item | Caminho |
|------|---------|
| Componente base | `components/ui/Modal.tsx` |
| Usado em | Agenda, tarefas, equipe, financeiro, configurações, planos, prontuário |

**Como funciona:** O modal renderiza via `createPortal` no `body`, com `fixed inset-0`, backdrop `bg-slate-900/50` e blur. ESC fecha; scroll do body é bloqueado.

---

### 2.2 Permissões por cargo (middleware)

| Item | Caminho |
|------|---------|
| Middleware Next.js | `middleware.ts` |
| Cookies de auth/módulos | `lib/authCookies.ts` |
| Sincronização no client | `components/AuthGuard.tsx` |
| Login seta cookie | `app/login/page.tsx` |
| Presets de rotas | `lib/permissionPresets.ts` |

**Como funciona:**
1. Após login, o client grava cookies `ortus_auth` e `ortus_modules`.
2. O middleware bloqueia rotas sem autenticação (redireciona para `/login`).
3. Rotas de módulos não permitidos redirecionam para `/dashboard?acesso=negado`.
4. Admin/super-admin recebem acesso total (`*`).

**Onde testar:** Faça login com usuário comum → Equipe → edite permissões → tente acessar `/financeiro` sem permissão.

---

### 2.3 Débitos e pagamento pendente

| Item | Caminho |
|------|---------|
| Checkbox na agenda | `app/agenda/page.tsx` |
| Checkbox no modal de tratamento | `app/pacientes/[id]/page.tsx` |
| Aba Débitos + botão manual | `app/pacientes/[id]/page.tsx` |

**Como usar — Agenda:**
1. Abra **Agenda** → crie ou edite um agendamento.
2. Marque **“Pagamento pendente — registrar em Débitos do paciente”**.
3. Ao salvar, o status vira `fiado` e o valor aparece na aba **Débitos** do prontuário.

**Como usar — Prontuário (tratamento):**
1. **Pacientes** → ficha → aba **Tratamentos e Evoluções**.
2. Novo tratamento → marque **“Registrar como pagamento pendente (fiado)”**.
3. O débito é criado automaticamente.

**Como usar — Débito manual:**
1. Prontuário → aba **Débitos**.
2. Clique **“Adicionar débito”**.
3. Preencha valor, descrição e salve.

---

### 2.4 Pacientes (lista simplificada)

| Item | Caminho |
|------|---------|
| Lista e atalhos | `app/pacientes/page.tsx` |
| Modal de ações | `components/PatientActionModal.tsx` |

**O que mudou:**
- Clique na linha/card abre **direto a ficha completa** (`/pacientes/[id]`).
- Removidos SMS e E-mail da lista principal.
- Mantidos: **WhatsApp**, **Agendar consulta**, **Nova prótese**.
- Tela intermediária de ações foi eliminada (ações ficam nos botões rápidos).

---

### 2.5 Sidebar e header

| Item | Caminho |
|------|---------|
| Layout principal | `components/AuthGuard.tsx` |

**O que mudou:**
- Seta de recolher menu com `z-50` (não corta mais).
- Seletor de unidade **somente no header** (removido da sidebar).
- Ícones separados: **Mail** (mensagens) e **Bell** (alertas/notificações).

---

### 2.6 Agenda — procedimentos

| Item | Caminho |
|------|---------|
| Combobox especialidade + procedimento | `components/forms/ProcedureCombobox.tsx` |
| Formulário da agenda | `app/agenda/page.tsx` |

**Como usar:**
1. Ao criar agendamento, escolha primeiro a **especialidade** (select).
2. Digite o procedimento — sugestões aparecem em tempo real.
3. Use a **seta** ao lado do campo para abrir a lista completa.
4. **Não é mais possível** criar serviço ou tratamento base aqui — faça em **Ajustes → Tratamentos Base**.

---

### 2.7 Próteses (tela simplificada)

| Item | Caminho |
|------|---------|
| Kanban | `app/proteses/KanbanProtesesInteligente.tsx` |

**O que mudou:**
- Header compacto; barra “Fluxo do Processo” removida.
- Cards mostram: nome, tipo/cor, status e contador de provas.
- Filtros de **período** e **status** com `CustomSelect`.

---

### 2.8 Financeiro

| Item | Caminho |
|------|---------|
| Página | `app/financeiro/page.tsx` |

**O que mudou:**
- Modais migrados para `Modal.tsx`.
- **Restaurar cancelado** funciona na primeira tentativa (`metaOverride` evita race com state).
- Categorias cadastradas em Ajustes passam a aparecer nos **Relatórios**.

---

### 2.9 Relatórios

| Item | Caminho |
|------|---------|
| Página | `app/relatorios/page.tsx` |

**Novos filtros e dados:**
- Período (7d, 30d, 90d, personalizado).
- Filtro por profissional, status e **categoria financeira**.
- KPIs: faturamento, ticket médio, comparecimento, fiados.
- Breakdown por categoria.

---

### 2.10 Planos

| Item | Caminho |
|------|---------|
| Componente embed | `app/planos/page.tsx` |
| Onde aparece | **Ajustes → Contratos & Docs** (aba Planos removida do menu principal) |

**O que mudou:**
- Removido template de convênio e botão reajustar.
- Novo plano: apenas **nome**, **observações** e **“Criar plano vazio”**.
- Plano **Particular** criado automaticamente com todos os procedimentos ativos.
- Layout compacto com chips de seleção.
- Textos atualizados (sem menção a “convênio” na interface).

**Como usar:**
1. **Ajustes → Contratos & Docs** → role até a seção **Planos**.
2. Selecione um plano no chip superior.
3. Ative/desative tratamentos na tabela TUSS.
4. **Novo plano** → preencha nome e observações → **Criar plano vazio**.

---

### 2.11 Configurações

| Item | Caminho |
|------|---------|
| Página | `app/configuracoes/page.tsx` |
| Defaults de taxas | `lib/configDefaults.ts` |
| Variáveis de documentos | `lib/documentVariables.ts` |

#### Aba Geral (primeira aba)
- Preferências da clínica (nome, CNPJ, horários, dias).
- **Cor do tema** — seletor com 5 opções (blue, emerald, purple, rose, slate).
- Toggles de notificações.

#### Anamnese
- Popup de confirmação ao **excluir pergunta** (inclusive em branco).
- Scroll automático ao adicionar pergunta.
- Botão “Adicionar pergunta” também no final da lista.

#### Contratos & Docs
- Variáveis exibidas como **“Nome do Paciente”** em vez de `{{paciente_nome}}`.
- Chips clicáveis inserem a variável no editor.

#### Categorias Financeiras
- Campo de busca **só filtra** (contador em tempo real).
- Botão **Adicionar** abre modal custom (nome, cor, tipo).
- Editar também usa modal (não mais `prompt` do navegador).

#### Taxas
- Crédito separado **por parcela (1x–12x)** e **por bandeira** (Visa, Master, Elo, etc.).
- Migração automática de faixas antigas tipo “2–6x” via `normalizarTaxasMaquininha()`.

---

### 2.12 Prontuário digital

| Item | Caminho |
|------|---------|
| Ficha completa | `app/pacientes/[id]/page.tsx` |
| TagInput | `components/ui/TagInput.tsx` |
| Catálogo medicamentos | `lib/medicamentosCatalogo.ts` |
| Evoluções | `app/pacientes/[id]/TabEvolucao.tsx` |

#### Anamnese
- **Ficha médica rápida:** digite e pressione **Enter** → vira chip/tag.
- **Medicamentos:** mesmo sistema + autocomplete do catálogo.
- **Anamneses salvas:** clique na linha → popup de visualização.

#### Tratamentos e Evoluções
- Aba renomeada; toggle interno **Tratamentos | Evoluções**.
- Removidas: legendas redundantes, WhatsApp no odontograma, botão Salvar do odontograma.
- **Autosave** do odontograma (debounce 800 ms) com indicador “Salvando...”.
- Botões Limpar/PDF menores no header do odontograma.

#### Dados pessoais
- Botões **Editar / Salvar** ficam **somente** dentro da aba Dados Pessoais.

---

### 2.13 Inbox (central de avisos)

| Item | Caminho |
|------|---------|
| Página | `app/inbox/page.tsx` |
| Ícones no header | `components/AuthGuard.tsx` |

**Como usar:**
- Ícone **envelope (Mail)** → `/inbox?tab=mensagens`
- Ícone **sino (Bell)** → `/inbox?tab=alertas`

---

### 2.14 Componentes personalizados (UI)

| Item | Caminho |
|------|---------|
| Select customizado | `components/ui/CustomSelect.tsx` |
| Opções centralizadas | `lib/formOptions.ts` |
| Tags / chips | `components/ui/TagInput.tsx` |
| Alertas custom | `components/ui/CustomAlert.tsx` |

**Nota:** Não restam `<select>` nativos no projeto. Inputs de data, número e checkbox permanecem nativos.

---

### 2.15 Tema visual (`cor_tema`)

| Item | Caminho |
|------|---------|
| Provider | `components/ThemeProvider.tsx` |
| Presets e apply | `lib/themePresets.ts` |
| Variáveis CSS | `app/globals.css` |
| Layout | `app/layout.tsx` |

**Como usar:**
1. **Ajustes → Geral → Aparência do Sistema → Cor do tema**.
2. Escolha a cor → aplica na hora.
3. Afeta: nav ativo, botões primários em Configurações, header, chips de plano, badges.

**Classes CSS disponíveis:** `btn-ortus-primary`, `text-ortus-accent`, `bg-ortus-accent-soft`, `chip-ortus-active`, `toggle-ortus-on`, etc.

---

## 3. Arquivos novos criados

| Arquivo | Função |
|---------|--------|
| `components/ui/Modal.tsx` | Modal portal com backdrop |
| `components/ui/TagInput.tsx` | Input de tags com Enter |
| `components/forms/ProcedureCombobox.tsx` | Especialidade + procedimento na agenda |
| `components/ThemeProvider.tsx` | Aplica cor do tema da clínica |
| `middleware.ts` | Proteção de rotas server-side |
| `lib/authCookies.ts` | Cookies ortus_auth / ortus_modules |
| `lib/checkModuleAccess.ts` | Helper de permissões |
| `lib/formOptions.ts` | UF, sexo, parentesco, fuso, etc. |
| `lib/themePresets.ts` | IDs e função applyTheme |
| `lib/medicamentosCatalogo.ts` | Lista para autocomplete |

---

## 4. Mapa PDF → implementação

| # | Requisito do PDF | Status | Onde ver |
|---|------------------|--------|----------|
| 1 | Permissões por cargo com segurança | ✅ | Middleware + AuthGuard + Equipe |
| 2 | Popup com fundo cinza full-screen | ✅ | `Modal.tsx` |
| 3 | Débitos: pagamento pendente + manual | ✅ | Agenda, prontuário, aba Débitos |
| 4 | Pacientes: atalhos e ficha direta | ✅ | `/pacientes` |
| 5 | Sidebar: seta e unidade | ✅ | `AuthGuard.tsx` |
| 6 | Próteses simplificado + filtros | ✅ | `/proteses` |
| 7 | Tarefas modais corrigidos | ✅ | `/tarefas` |
| 8 | Componentes HTML personalizados | ✅ | CustomSelect em todo o app |
| 9 | Financeiro restore 1x | ✅ | `/financeiro` |
| 10 | Categorias nos relatórios | ✅ | `/relatorios` |
| 11–13 | Modais financeiro/equipe | ✅ | Modal.tsx |
| 14–17 | Agenda: especialidade, autocomplete, combobox | ✅ | ProcedureCombobox |
| 18–19 | Modais clínicas/planos | ✅ | `/configuracoes`, `/planos` |
| 20 | Planos refatorados | ✅ | Contratos & Docs |
| 21 | Geral primeira aba + seletores | ✅ | `/configuracoes` |
| 22–23 | Anamnese modal + confirm delete | ✅ | `/configuracoes` |
| 24 | Variáveis legíveis em contratos | ✅ | `documentVariables.ts` |
| 25–26 | Categorias fin modais | ✅ | `/configuracoes` |
| 27 | Taxas por parcela e bandeira | ✅ | `/configuracoes` |
| 28–30 | Ficha rápida, medicamentos, preview anamnese | ✅ | Prontuário |
| 31–36 | Tratamentos/evoluções refatorados | ✅ | Prontuário |
| 37 | Inbox mensagens separadas | ✅ | Header + `/inbox` |

---

## 5. Itens NÃO implementados (OBSERVAÇÕES do PDF)

Estes itens foram **explicitamente ignorados** por serem análise interna:

- Opção “pago pelo plano” nos planos
- Comunicação e backup (revisão futura)
- Painel SaaS
- Emitir documento avançado (pré-visualização, logo)
- Harmonização orofacial prioritária

---

## 6. Checklist pós-atualização

- [ ] Fazer deploy na Vercel (middleware exige build Next.js atualizado)
- [ ] Testar login → cookies setados → navegação protegida
- [ ] Testar usuário com permissões limitadas (bloqueio de módulo)
- [ ] Configurar **cor do tema** em cada clínica se desejado
- [ ] Verificar plano **Particular** criado automaticamente
- [ ] Revisar taxas de maquininha por bandeira/parcela

---

## 7. Commits de referência

```
20f9f2a  Fecha gaps do PDF 02.08: middleware, tema, selects e polish.
1108d30  Implementa alteracoes do PDF 02.08 no Ortus.
```

**Total:** 37 arquivos · +3.599 / −2.047 linhas

---

*Documento gerado automaticamente a partir do código e do PDF ortus - alterações 02.08.*
