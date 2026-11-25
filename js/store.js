import { cleanState } from './bingo-domain.js';
import { requireSupabase } from './supabase-client.js';

let current = null;
let activeGameId = null;
let channel = null;
let refreshInFlight = null;
let refreshPending = false;
const listeners = new Set();
const connectionListeners = new Set();
let connectionStatus = 'connecting';

export async function initialize() {
  requireSupabase();
  if (!channel) {
    const client = requireSupabase();
    channel = client.channel('bingo-active-game')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'called_balls' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closed_prizes' }, scheduleRefresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { setConnectionStatus('connected'); scheduleRefresh(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnectionStatus('disconnected');
      });
  }
  await refreshState();
  return current;
}

export function getState() { return current; }

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeConnection(listener) {
  connectionListeners.add(listener);
  listener(connectionStatus);
  return () => connectionListeners.delete(listener);
}

export async function refreshState() {
  if (refreshInFlight) {
    refreshPending = true;
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    do {
      refreshPending = false;
      await loadState();
    } while (refreshPending);
    return current;
  })().finally(() => {
    refreshInFlight = null;
    if (refreshPending) scheduleRefresh();
  });
  return refreshInFlight;
}

async function loadState() {
  const client = requireSupabase();
  const { data: game, error: gameError } = await client.from('games')
    .select('id, game_name, source_name, prizes')
    .eq('is_active', true)
    .maybeSingle();
  if (gameError) throw gameError;
  if (!game) {
    activeGameId = null;
    current = null;
    notify();
    return null;
  }

  const [cardsResult, ballsResult, prizesResult] = await Promise.all([
    client.from('cards').select('card_number, rows, purchased_at').eq('game_id', game.id).order('card_number'),
    client.from('called_balls').select('ball_number').eq('game_id', game.id).order('id'),
    client.from('closed_prizes').select('prize_key, winner_card_number').eq('game_id', game.id),
  ]);
  for (const result of [cardsResult, ballsResult, prizesResult]) if (result.error) throw result.error;

  const cards = cardsResult.data.map((card) => ({
    id: card.card_number,
    rows: card.rows,
    columns: Object.fromEntries(['B', 'I', 'N', 'G', 'O'].map((letter, columnIndex) => [letter, card.rows.map((row) => row[columnIndex])])),
  }));
  const closedPrizes = Object.fromEntries(prizesResult.data.map((prize) => [prize.prize_key, prize.winner_card_number ?? '']));
  const next = cleanState({
    version: 1,
    gameName: game.game_name,
    sourceName: game.source_name,
    cards,
    prizes: game.prizes,
    called: ballsResult.data.map((ball) => ball.ball_number),
    purchased: cardsResult.data.filter((card) => card.purchased_at).map((card) => card.card_number),
    closedPrizes,
  });
  if (!next) throw new Error('O estado recebido do Supabase não passou pela validação.');
  activeGameId = game.id;
  current = next;
  notify();
  return current;
}

function scheduleRefresh() {
  refreshState().catch((error) => {
    setConnectionStatus('disconnected');
    console.error('Falha ao sincronizar o bingo:', error);
  });
}

function notify() { for (const listener of listeners) listener(current); }
function setConnectionStatus(status) {
  connectionStatus = status;
  for (const listener of connectionListeners) listener(status);
}

async function invoke(name, args = {}) {
  if (!activeGameId && name !== 'import_game') throw new Error('Não há jogo ativo. Importe o JSON inicial pela página de gerenciamento.');
  const { error } = await requireSupabase().rpc(name, args);
  if (error) throw new Error(error.message || 'Não foi possível salvar a alteração.');
  await refreshState();
  return current;
}

export function purchaseCard(cardNumber) { return invoke('purchase_card', { p_card_number: cardNumber }); }
export function undoCardPurchase(cardNumber) { return invoke('undo_card_purchase', { p_card_number: cardNumber }); }
export function deleteAvailableCard(cardNumber) { return invoke('delete_available_card', { p_card_number: cardNumber }); }
export function callBall(ballNumber) { return invoke('call_ball', { p_ball_number: ballNumber }); }
export function uncallBall(ballNumber) { return invoke('uncall_ball', { p_ball_number: ballNumber }); }
export function undoLastBall() { return invoke('undo_last_ball'); }
export function clearCalledBalls() { return invoke('clear_called_balls'); }
export function closePrize(prizeKey, winnerCardNumber = null) {
  return invoke('close_prize', { p_prize_key: prizeKey, p_winner_card_number: winnerCardNumber || null });
}
export function reopenPrize(prizeKey) { return invoke('reopen_prize', { p_prize_key: prizeKey }); }
export function startNewGame() { return invoke('start_new_game'); }

export async function importGame(project, sourceName, gameName) {
  const client = requireSupabase();
  const { error } = await client.rpc('import_game', {
    p_game_name: gameName,
    p_source_name: sourceName,
    p_prizes: project.prizes,
    p_cards: project.cards.map(({ id, rows }) => ({ id, rows })),
  });
  if (error) throw new Error(error.message || 'Não foi possível importar este jogo.');
  await refreshState();
  return current;
}

export function closeRealtime() {
  if (channel) requireSupabase().removeChannel(channel);
  channel = null;
}
