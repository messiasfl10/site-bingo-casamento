import { cleanState, makeInitialState } from './bingo-domain.js';

const STORAGE_KEY = 'livia-messias-bingo-v1';
const DEFAULT_JSON = new URL('../inputs/bingo_card_500_official.json', import.meta.url);
let current = null;
const listeners = new Set();

export async function initialize() {
  const saved = readSaved();
  if (saved) { current = saved; return current; }
  const response = await fetch(DEFAULT_JSON);
  if (!response.ok) throw new Error('Não foi possível carregar o JSON padrão. Sirva a pasta por HTTP/HTTPS, por exemplo com Live Server.');
  const initial = makeInitialState(await response.json());
  persist(initial);
  current = initial;
  return current;
}

export function getState() { return current; }

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function update(mutator) {
  if (!current) throw new Error('O jogo ainda não foi carregado.');
  const next = cleanState(mutator(structuredClone(current)));
  if (!next) throw new Error('A atualização do jogo não passou pela validação.');
  persist(next);
  current = next;
  notify();
  return current;
}

function readSaved() {
  try { return cleanState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return null; }
}

function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { throw new Error('Não foi possível salvar. Verifique o espaço disponível no navegador.'); }
}

function notify() { for (const listener of listeners) listener(current); }

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  const next = readSaved();
  if (next) { current = next; notify(); }
});
