// Os valores abaixo são configurações públicas do cliente web, não senhas.
// Configure a URL e a chave publishable do projeto Supabase e a Site Key do Turnstile.
export const SUPABASE_URL = 'https://ztqmopfhjnypsiktwesp.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Fo71vC1oQfdr9gPpMlyLMQ_g4PaEa8f';
export const TURNSTILE_SITE_KEY = '0x4AAAAAAGRt5owTQ4wa5rnX';

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
