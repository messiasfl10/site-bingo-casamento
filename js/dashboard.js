import { COLUMNS, COLUMN_RANGES, cardProgress, TOTAL_BALLS } from './bingo-domain.js';
import { getState, initialize, subscribe } from './store.js';
import { element, formatBall } from './ui.js';

let filter = 'all';
const board = document.getElementById('ball-board');

function render(state) {
  setStat('called-count', state.called.length, TOTAL_BALLS);
  setStat('valid-count', state.purchased.length, state.cards.length);
  document.getElementById('prize-count').textContent = String(Object.keys(state.prizes).length);
  document.getElementById('game-label').textContent = state.called.length ? 'Jogo em andamento' : 'Jogo pronto';
  renderBallBoard(state);
  renderLatest(state);
  renderPrizes(state);
  renderNear(state);
}

function setStat(id, current, total) {
  const host = document.getElementById(id);
  host.replaceChildren(element('span', '', String(current)), element('small', '', `/ ${total}`));
}

function renderBallBoard(state) {
  board.replaceChildren();
  for (const letter of COLUMNS) {
    const column = element('div', 'ball-column');
    const isClosed = Object.hasOwn(state.closedPrizes, letter);
    const header = element('div', `ball-column-head column-${letter.toLowerCase()} ${isClosed ? 'column-closed' : ''}`);
    header.append(element('span', 'column-letter', letter));
    if (isClosed) header.append(element('small', 'column-closed-badge', 'Prêmio encerrado'));
    column.append(header);
    const list = element('div', 'ball-list');
    const [from, to] = COLUMN_RANGES[letter];
    for (let value = from; value <= to; value += 1) {
      const button = element('span', `ball ${state.called.includes(value) ? 'is-called' : ''}`, String(value));
      button.setAttribute('aria-label', `${letter} ${value}: ${state.called.includes(value) ? 'chamada' : 'não chamada'}`);
      if (state.called.includes(value)) button.title = `${formatBall(value)} chamada`;
      list.append(button);
    }
    column.append(list);
    board.append(column);
  }
}

function renderLatest(state) {
  const latest = [...state.called].reverse();
  const feature = document.getElementById('latest-ball');
  feature.replaceChildren();
  feature.className = `latest-ball ${latest.length ? '' : 'empty'}`;
  feature.append(element('span', '', latest.length ? formatBall(latest[0]) : '—'));
  feature.append(element('small', '', latest.length ? 'Última bola chamada' : 'À espera da primeira bola'));
  const list = document.getElementById('recent-list');
  list.replaceChildren();
  for (const number of latest.slice(1, 6)) {
    const item = element('li', 'recent-item');
    item.append(element('span', 'recent-number', formatBall(number)), element('span', 'recent-label', 'Bola chamada'));
    list.append(item);
  }
  document.getElementById('called-empty').hidden = latest.length > 0;
}

function renderPrizes(state) {
  const list = document.getElementById('prize-list');
  list.replaceChildren();
  for (const [key, prize] of Object.entries(state.prizes)) {
    const item = element('div', 'prize-item');
    const name = key === 'Cartela Cheia' ? 'Cartela cheia' : `Coluna ${key}`;
    const isClosed = Object.hasOwn(state.closedPrizes, key);
    item.classList.toggle('prize-closed', isClosed);
    item.append(element('span', 'prize-mark', key === 'Cartela Cheia' ? '✧' : key), element('span', 'prize-name', name), element('strong', 'prize-value', prize));
    if (isClosed) {
      const winnerId = state.closedPrizes[key];
      item.append(element('small', 'prize-status', winnerId ? `Prêmio entregue • Cartela ${winnerId}` : 'Prêmio entregue'));
    }
    list.append(item);
  }
}

function renderNear(state) {
  const cards = state.cards.filter((card) => state.purchased.includes(card.id)).map((card) => ({ card, progress: cardProgress(card, state.called) }));
  const entries = [];
  for (const { card, progress } of cards) {
    for (const column of progress.columns) if (!Object.hasOwn(state.closedPrizes, column.letter) && column.remaining <= 2) entries.push({ id: card.id, type: 'column', label: `Coluna ${column.letter}`, remaining: column.remaining });
    if (!Object.hasOwn(state.closedPrizes, 'Cartela Cheia') && progress.fullRemaining <= 3) entries.push({ id: card.id, type: 'full', label: 'Cartela cheia', remaining: progress.fullRemaining });
  }
  entries.sort((a, b) => a.remaining - b.remaining || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));
  const filtered = filter === 'all' ? entries : entries.filter((entry) => entry.type === filter);
  document.getElementById('near-total').textContent = `${filtered.length} ${filtered.length === 1 ? 'chance' : 'chances'}`;
  const host = document.getElementById('near-cards');
  host.replaceChildren();
  if (!filtered.length) {
    const allPrizesClosed = Object.keys(state.prizes).length > 0 && Object.keys(state.prizes).every((key) => Object.hasOwn(state.closedPrizes, key));
    const message = allPrizesClosed ? 'Todos os prêmios já foram entregues.' : !state.purchased.length ? 'As cartelas compradas aparecerão aqui quando estiverem perto de ganhar.' : 'Ainda não há cartelas a uma ou duas bolas de um prêmio disponível.';
    host.append(element('div', 'near-empty', message));
    return;
  }
  for (const entry of filtered.slice(0, 24)) {
    const row = element('article', `near-card ${entry.remaining === 0 ? 'near-winner' : ''}`);
    row.append(element('span', 'card-chip', `#${entry.id}`), element('span', 'near-label', entry.label));
    row.append(element('span', `near-progress ${entry.remaining === 0 ? 'progress-winner' : ''}`, entry.remaining === 0 ? 'BINGO!' : `${entry.remaining} ${entry.remaining === 1 ? 'número' : 'números'} faltando`));
    host.append(row);
  }
}

document.querySelectorAll('.near-tab').forEach((button) => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('.near-tab').forEach((tab) => { const selected = tab === button; tab.classList.toggle('selected', selected); tab.setAttribute('aria-selected', String(selected)); });
  render(getState());
}));

initialize().then((state) => { render(state); subscribe(render); }).catch((error) => {
  document.getElementById('game-label').textContent = 'Não foi possível carregar o jogo';
  document.getElementById('near-cards').textContent = error.message;
});
