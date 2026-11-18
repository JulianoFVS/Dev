import { supabase } from '@/lib/supabase';
import { salvarSessaoCache } from '@/lib/local/cliente';
import { clearAuthCookies } from '@/lib/authCookies';
import { clearProfileSession } from '@/lib/profileSession';

/**
 * Chaves de `localStorage` que pertencem à sessão: clínica ativa, lista de
 * clínicas e as cópias de configuração da clínica (modelos de anamnese e as
 * chaves antigas que o carregarConfig ainda migra para o banco). Sem limpar,
 * quem entra depois veria, e gravaria na própria clínica, a configuração de
 * quem saiu.
 */
const CHAVES_DA_SESSAO = [
  'ortus_clinica_id',
  'ortus_clinics_cache',
  'ortus_anamnese_modelos',
  'ortus_preferencias',
  'ortus_categorias_financeiro',
  'ortus_modelos_documentos',
  'ortus_templates_comunicacao',
  'ortus_taxas_maquininha',
  'ortus_lancamentos_meta',
];

/**
 * Tira do navegador tudo que pertence a quem estava logado: marcadores de
 * sessão, clínica ativa, lista de clínicas e os caches de lista por rota
 * (pacientes, agenda, equipe, relatórios...), que vivem em `sessionStorage`.
 *
 * Chamado no logout e sempre que o Supabase avisa que a sessão acabou, para
 * que a próxima pessoa a entrar neste navegador não veja dado da anterior.
 */
export function limparRastrosDaSessao() {
  clearAuthCookies();
  clearProfileSession();
  try {
    for (const chave of CHAVES_DA_SESSAO) localStorage.removeItem(chave);
  } catch {
    /* armazenamento bloqueado pelo navegador */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* armazenamento bloqueado pelo navegador */
  }
}

/** Logout completo: sessão local do desktop, sessão do Supabase e rastros no navegador. */
export async function encerrarSessao() {
  try {
    await salvarSessaoCache(null);
  } catch {
    /* o cache local é melhor-esforço */
  }
  try {
    await supabase.auth.signOut();
  } catch {
    /* sem rede: a limpeza local abaixo já tira o acesso deste navegador */
  }
  limparRastrosDaSessao();
}
