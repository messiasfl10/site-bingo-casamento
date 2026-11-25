import { COLUMNS, COLUMN_RANGES, TOTAL_BALLS, cardProgress, normalizeProject } from './bingo-domain.js';
import {
  callBall, clearCalledBalls, closePrize as closePrizeInStore, deleteAvailableCard, purchaseCard,
  getState, importGame, initialize, reopenPrize, startNewGame, subscribe,
  subscribeConnection, undoCardPurchase, undoLastBall, uncallBall,
} from './store.js';
import { mountStaffGate } from './staff-auth.js';
import { element, formatBall, showToast } from './ui.js';

let stream = null;
const board = document.getElementById('admin-ball-board');

function render(state) {
  const hasGame = Boolean(state);
  document.getElementById('admin-game-name').textContent = state?.gameName ?? 'Jogo não configurado';
  document.getElementById('admin-card-count').textContent = String(state?.cards.length ?? 0);
  document.getElementById('admin-purchased-count').textContent = String(state?.purchased.length ?? 0);
  document.getElementById('admin-called-count').textContent = `${state?.called.length ?? 0} / ${TOTAL_BALLS}`;
  document.getElementById('ball-counter').textContent = `${state?.called.length ?? 0} de ${TOTAL_BALLS}`;
  document.getElementById('purchased-badge').textContent = String(state?.purchased.length ?? 0);
  document.getElementById('load-status').textContent = hasGame ? `${state.cards.length} cartelas carregadas` : 'Importe o primeiro jogo';
  document.getElementById('loaded-source').textContent = hasGame ? `● ${state.sourceName}` : '● Nenhum jogo ativo';
  document.getElementById('load-default-json').hidden = hasGame;
  document.getElementById('new-game').disabled = !hasGame;
  document.getElementById('card-number').disabled = !hasGame;
  document.getElementById('start-scan').disabled = !hasGame;
  renderBoard(state);
  renderPrizeAdmin(state);
  renderCardList(state);
}

function renderBoard(state) {
  board.replaceChildren();
  for (const letter of COLUMNS) {
    const group = element('div', 'ball-column');
    const isClosed = Boolean(state && Object.hasOwn(state.closedPrizes, letter));
    const header = element('div', `ball-column-head column-${letter.toLowerCase()} ${isClosed ? 'column-closed' : ''}`);
    header.append(element('span', 'column-letter', letter));
    if (isClosed) header.append(element('small', 'column-closed-badge', 'Prêmio encerrado'));
    group.append(header);
    const list = element('div', 'ball-list');
    const [start, end] = COLUMN_RANGES[letter];
    for (let number = start; number <= end; number += 1) {
      const called = Boolean(state?.called.includes(number));
      const button = element('button', `ball admin-ball ${called ? 'is-called' : ''}`, String(number));
      button.type = 'button';
      button.disabled = !state;
      button.setAttribute('aria-pressed', String(called));
      button.setAttribute('aria-label', `${formatBall(number)} ${called ? 'chamada; toque para desfazer' : 'não chamada; toque para marcar'}`);
      button.addEventListener('click', () => toggleBall(number));
      list.append(button);
    }
    group.append(list);
    board.append(group);
  }
}

function renderPrizeAdmin(state) {
  const host = document.getElementById('prize-admin-list');
  host.replaceChildren();
  if (!state) { host.append(element('div', 'list-empty', 'Importe o JSON para carregar os prêmios.')); return; }
  for (const [key, prize] of Object.entries(state.prizes)) {
    const winnerId = Object.hasOwn(state.closedPrizes, key) ? state.closedPrizes[key] : null;
    const category = key === 'Cartela Cheia' ? 'Cartela cheia' : `Coluna ${key}`;
    const row = element('div', `prize-admin-row ${winnerId !== null ? 'is-prize-closed' : ''}`);
    const info = element('div', 'prize-admin-info');
    info.append(element('strong', '', category), element('span', '', prize));
    const action = element('button', `button ${winnerId !== null ? 'button-quiet' : 'button-primary'} prize-admin-action`, winnerId !== null ? 'Reabrir prêmio' : 'Marcar como entregue');
    action.type = 'button';
    if (winnerId !== null) {
      row.append(info, element('span', 'prize-admin-status', winnerId ? `Entregue · cartela ${winnerId}` : 'Entregue'), action);
      action.addEventListener('click', () => runAction(() => reopenPrize(key), `${category} reaberta.`));
    } else {
      const input = element('input', 'prize-winner-input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 40;
      input.placeholder = 'Nº da cartela (opcional)';
      input.setAttribute('aria-label', `Cartela vencedora de ${category}`);
      row.append(info, input, action);
      action.addEventListener('click', () => closePrize(key, category, input.value));
    }
    host.append(row);
  }
}

async function closePrize(key, category, rawWinnerId) {
  let winnerId = rawWinnerId.trim();
  const state = getState();
  if (!state) return showToast('Importe um jogo antes de encerrar prêmios.', 'error');
  if (winnerId) {
    const card = state.cards.find((item) => item.id.toLocaleLowerCase('pt-BR') === winnerId.toLocaleLowerCase('pt-BR'));
    if (!card) return showToast(`A cartela ${winnerId.slice(0, 40)} não está neste jogo.`, 'error');
    winnerId = card.id;
    if (!state.purchased.includes(card.id)) return showToast(`A cartela ${card.id} não está marcada como comprada.`, 'error');
    const progress = cardProgress(card, state.called);
    const completed = key === 'Cartela Cheia' ? progress.fullRemaining === 0 : progress.columns.find((column) => column.letter === key)?.remaining === 0;
    if (!completed) return showToast(`A cartela ${card.id} ainda não completou ${category}.`, 'error');
  }
  await runAction(() => closePrizeInStore(key, winnerId), `${category} marcada como entregue.`);
}

function renderCardList(state) {
  const host = document.getElementById('purchased-list');
  host.replaceChildren();
  if (!state) { host.append(element('div', 'list-empty', 'Importe o JSON para carregar as cartelas.')); return; }
  const search = document.getElementById('card-search').value.trim().toLocaleLowerCase('pt-BR');
  const purchased = new Set(state.purchased);
  const cards = state.cards.filter((card) => !search || card.id.toLocaleLowerCase('pt-BR').includes(search));
  cards.sort((a, b) => Number(purchased.has(b.id)) - Number(purchased.has(a.id)) || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));
  const visible = cards.slice(0, 80);
  for (const card of visible) {
    const isPurchased = purchased.has(card.id);
    const row = element('div', 'purchased-card');
    const info = element('div', 'purchased-info');
    info.append(element('strong', '', `#${card.id}`), element('span', isPurchased ? 'purchased-status' : 'not-purchased-status', isPurchased ? 'Comprada' : 'Disponível'));
    const action = element('button', `mini-action ${isPurchased ? 'remove-purchase' : 'remove-card'}`, isPurchased ? 'Desfazer' : 'Excluir');
    action.type = 'button';
    action.setAttribute('aria-label', isPurchased ? `Desfazer compra da cartela ${card.id}` : `Excluir a cartela ${card.id} do jogo`);
    action.addEventListener('click', async () => {
      if (isPurchased) await runAction(() => undoCardPurchase(card.id), `Compra da cartela ${card.id} desfeita.`);
      else if (window.confirm(`Excluir a cartela ${card.id} deste jogo?`)) await runAction(() => deleteAvailableCard(card.id), `Cartela ${card.id} excluída do jogo.`);
    });
    row.append(info, action);
    host.append(row);
  }
  if (!visible.length) host.append(element('div', 'list-empty', search ? 'Nenhuma cartela com esse número.' : 'Não há cartelas carregadas.'));
  if (cards.length > visible.length) host.append(element('div', 'list-limit', `Exibindo 80 de ${cards.length}. Digite um número para filtrar.`));
}

async function toggleBall(number) {
  const state = getState();
  if (!state) return;
  await runAction(() => state.called.includes(number) ? uncallBall(number) : callBall(number));
}

function findCardFromCode(rawValue) {
  const value = rawValue.trim();
  if (!value) throw new Error('Digite o número da cartela.');
  const state = getState();
  if (!state) throw new Error('Ainda não há um jogo carregado.');
  const direct = state.cards.find((card) => card.id.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'));
  const digits = value.match(/\d+/g);
  const extracted = digits?.at(-1);
  const card = direct || state.cards.find((item) => item.id === extracted || (extracted && item.id === extracted.replace(/^0+(?=\d)/, '')));
  if (!card) throw new Error(`A cartela “${value.slice(0, 40)}” não está neste jogo.`);
  if (state.purchased.includes(card.id)) throw new Error(`A cartela ${card.id} já está marcada como comprada.`);
  return card;
}

async function registerCard(rawValue) {
  const card = findCardFromCode(rawValue);
  await purchaseCard(card.id);
  document.getElementById('card-number').value = '';
  showFeedback(`Cartela ${card.id} registrada como comprada.`, 'success');
}

function showFeedback(message, kind) {
  const feedback = document.getElementById('purchase-feedback');
  feedback.textContent = message;
  feedback.className = `feedback ${kind}`;
}

async function runAction(action, successMessage = '') {
  try {
    await action();
    if (successMessage) showToast(successMessage);
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar a alteração.', 'error');
  }
}

document.getElementById('card-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await registerCard(document.getElementById('card-number').value); }
  catch (error) { showFeedback(error.message, 'error'); }
});
document.getElementById('card-search').addEventListener('input', () => renderCardList(getState()));

document.getElementById('json-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  document.getElementById('file-name').textContent = file.name;
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('O arquivo JSON excede o limite de 8 MB.');
    const project = normalizeProject(JSON.parse(await file.text()));
    if (!window.confirm(`Importar ${project.cards.length} cartelas de “${file.name}”? O jogo atual será arquivado e substituído.`)) return;
    const gameName = file.name.replace(/\.json$/i, '').slice(0, 80) || 'Novo jogo';
    await importGame(project, file.name, gameName);
    document.getElementById('loaded-source').textContent = `● ${file.name}`;
    showToast(`${project.cards.length} cartelas importadas. O novo jogo está ativo.`);
  } catch (error) {
    showToast(error instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : error.message, 'error');
  } finally { event.target.value = ''; }
});

document.getElementById('load-default-json').addEventListener('click', async () => {
  try {
    const response = await fetch(new URL('../inputs/bingo_card_500_official.json', import.meta.url));
    if (!response.ok) throw new Error('Não foi possível carregar o JSON padrão.');
    const project = normalizeProject(await response.json());
    await importGame(project, 'inputs/bingo_card_500_official.json', 'Bingo dos Noivos');
    showToast(`${project.cards.length} cartelas padrão carregadas.`);
  } catch (error) { showToast(error.message, 'error'); }
});

document.getElementById('new-game').addEventListener('click', () => {
  if (!window.confirm('Começar um novo jogo? As bolas chamadas e cartelas compradas serão apagadas. As cartelas e os prêmios atuais serão mantidos.')) return;
  runAction(() => startNewGame(), 'Novo jogo iniciado.');
});
document.getElementById('undo-ball').addEventListener('click', async () => {
  const state = getState();
  if (!state?.called.length) return showToast('Ainda não há bolas chamadas.', 'error');
  const last = state.called.at(-1);
  await runAction(() => undoLastBall(), `Chamada ${formatBall(last)} desfeita.`);
});
document.getElementById('clear-balls').addEventListener('click', () => {
  if (!getState()?.called.length) return;
  if (window.confirm('Limpar todas as bolas chamadas?')) runAction(() => clearCalledBalls(), 'Chamadas removidas.');
});

async function startScanner() {
  if (!('BarcodeDetector' in window)) {
    showFeedback('Este navegador não oferece leitura QR nativa. Digite o número da cartela abaixo.', 'error');
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const video = document.getElementById('scanner-video');
    video.srcObject = stream;
    document.getElementById('scanner-wrap').hidden = false;
    await video.play();
    const scan = async () => {
      if (!stream) return;
      try {
        for (const code of await detector.detect(video)) {
          if (code.rawValue) {
            try { await registerCard(code.rawValue); stopScanner(); return; }
            catch (error) { stopScanner(); showFeedback(error.message, 'error'); return; }
          }
        }
      } catch { /* Aguarda o próximo quadro se o vídeo ainda não estiver pronto. */ }
      if (stream) requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  } catch (error) {
    stopScanner();
    showFeedback(error.name === 'NotAllowedError' ? 'Acesso à câmera negado. Digite o número da cartela.' : 'Não foi possível abrir a câmera. Digite o número da cartela.', 'error');
  }
}

function stopScanner() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  document.getElementById('scanner-video').srcObject = null;
  document.getElementById('scanner-wrap').hidden = true;
}

document.getElementById('start-scan').addEventListener('click', startScanner);
document.getElementById('stop-scan').addEventListener('click', stopScanner);
window.addEventListener('pagehide', stopScanner);

async function startAdmin() {
  try {
    render(await initialize());
    subscribe(render);
    subscribeConnection((status) => {
      const label = document.getElementById('admin-sync-status');
      label.textContent = status === 'connected' ? 'Sincronizado com a nuvem' : status === 'disconnected' ? 'Sem conexão com a nuvem' : 'Conectando ao Supabase…';
      label.className = `sync-status ${status}`;
    });
  }
  catch (error) { showToast(error.message, 'error'); }
}
mountStaffGate('admin', startAdmin).catch((error) => showToast(error.message, 'error'));
