import { isTurnstileConfigured, TURNSTILE_SITE_KEY } from './app-config.js';
import { requireSupabase, supabase } from './supabase-client.js';

let captchaWidgetId = null;
let captchaToken = '';

export async function mountStaffGate(requiredRole, onAuthorized) {
  const gate = document.getElementById('auth-gate');
  const app = document.getElementById('staff-app');
  const form = document.getElementById('staff-auth-form');
  const feedback = document.getElementById('auth-feedback');
  const signOut = document.getElementById('staff-sign-out');
  let authorizedUserId = null;

  function showFeedback(message, isError = true) {
    feedback.textContent = message;
    feedback.className = `feedback ${isError ? 'error' : 'success'}`;
  }

  function setSignedOut(message = '') {
    authorizedUserId = null;
    resetTurnstile();
    document.getElementById('staff-role-label').textContent = '';
    gate.hidden = false;
    app.hidden = true;
    signOut.hidden = true;
    if (message) showFeedback(message);
  }

  async function activate(session) {
    if (!session) { setSignedOut(); return; }
    const { data, error } = await requireSupabase().from('staff_members')
      .select('role, display_name')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error || !data) {
      await requireSupabase().auth.signOut();
      setSignedOut('Esta conta ainda não foi autorizada para o bingo.');
      return;
    }
    if (data.role !== requiredRole) {
      const destination = data.role === 'admin' ? 'admin.html' : 'vender.html';
      if (location.pathname.endsWith(destination)) {
        gate.hidden = true;
        app.hidden = false;
        signOut.hidden = false;
        document.getElementById('staff-role-label').textContent = data.display_name;
        if (authorizedUserId !== session.user.id) {
          authorizedUserId = session.user.id;
          await onAuthorized(data.role, session.user);
        }
      } else {
        location.replace(destination);
      }
      return;
    }
    gate.hidden = true;
    app.hidden = false;
    signOut.hidden = false;
    document.getElementById('staff-role-label').textContent = data.display_name;
    if (authorizedUserId !== session.user.id) {
      authorizedUserId = session.user.id;
      await onAuthorized(data.role, session.user);
    }
  }

  if (!supabase) {
    let message = 'Configure a conexão do Supabase em js/app-config.js e aplique as migrações antes de entrar.';
    try { requireSupabase(); } catch (error) { message = error.message; }
    setSignedOut(message);
    form.querySelector('button[type="submit"]').disabled = true;
    document.getElementById('turnstile-widget').hidden = true;
    return;
  }

  await mountTurnstile().catch((error) => showFeedback(error.message));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!captchaToken) return showFeedback('Conclua a verificação de segurança antes de entrar.');
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const { error } = await requireSupabase().auth.signInWithPassword({
        email: document.getElementById('staff-email').value.trim(),
        password: document.getElementById('staff-password').value,
        options: { captchaToken },
      });
      if (error) throw error;
      showFeedback('Acesso confirmado. Carregando…', false);
    } catch (error) {
      showFeedback(error.message || 'Não foi possível entrar. Confira os dados e tente novamente.');
      resetTurnstile();
    } finally {
      submit.disabled = false;
    }
  });
  signOut.addEventListener('click', async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) showFeedback(error.message);
  });

  requireSupabase().auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => activate(session).catch((error) => setSignedOut(error.message)), 0);
  });
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) return setSignedOut(error.message);
  await activate(data.session);
}

async function mountTurnstile() {
  const host = document.getElementById('turnstile-widget');
  if (!isTurnstileConfigured()) {
    host.textContent = 'Configure a Site Key do Turnstile em js/app-config.js.';
    throw new Error('Falta configurar o Cloudflare Turnstile.');
  }
  await loadTurnstileScript();
  captchaWidgetId = window.turnstile.render(host, {
    sitekey: TURNSTILE_SITE_KEY,
    callback: (token) => { captchaToken = token; },
    'expired-callback': () => { captchaToken = ''; },
    'error-callback': () => { captchaToken = ''; },
    theme: 'light',
  });
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o Cloudflare Turnstile.'));
    document.head.append(script);
  });
}

function resetTurnstile() {
  captchaToken = '';
  if (captchaWidgetId !== null && window.turnstile) window.turnstile.reset(captchaWidgetId);
}
