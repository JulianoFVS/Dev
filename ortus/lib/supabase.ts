import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cria o cliente com configurações explícitas de persistência
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // Salva no LocalStorage
    autoRefreshToken: true, // Renova o token sozinho
    detectSessionInUrl: true
  }
});