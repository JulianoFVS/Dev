import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cria o cliente com configurações explícitas de persistência
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // Salva no LocalStorage
    autoRefreshToken: true, // Renova o token sozinho
    detectSessionInUrl: true
  },
  global: {
    // 402 = gravação recusada porque a assinatura está em modo de consulta
    // (gatilho assinatura_barrar_escrita). Avisa a faixa da casca para conferir.
    fetch: async (entrada, opcoes) => {
      const resposta = await fetch(entrada, opcoes);
      if (resposta.status === 402 && typeof window !== 'undefined') window.dispatchEvent(new Event('ortus:assinatura'));
      return resposta;
    },
  },
});