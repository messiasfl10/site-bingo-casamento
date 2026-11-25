import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './app-config.js';

const createClient = window.supabase?.createClient;
export const supabase = isSupabaseConfigured() && createClient
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  })
  : null;

export function requireSupabase() {
  if (!createClient) throw new Error('A biblioteca do Supabase não carregou. Verifique a conexão e recarregue a página.');
  if (!supabase) throw new Error('Configure a URL e a chave publishable do Supabase em js/app-config.js.');
  return supabase;
}
