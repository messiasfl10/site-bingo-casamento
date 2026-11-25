// Os valores abaixo são configurações públicas do cliente web, não senhas.
// Configure a URL e a chave publishable do projeto Supabase e a Site Key do Turnstile.
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_COLOQUE_A_CHAVE_AQUI';
export const TURNSTILE_SITE_KEY = 'COLOQUE_A_SITE_KEY_AQUI';

export function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith('https://')
    && !SUPABASE_URL.includes('SEU-PROJETO')
    && SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
    && !SUPABASE_PUBLISHABLE_KEY.includes('COLOQUE');
}

export function isTurnstileConfigured() {
  return Boolean(TURNSTILE_SITE_KEY)
    && !TURNSTILE_SITE_KEY.includes('COLOQUE');
}
