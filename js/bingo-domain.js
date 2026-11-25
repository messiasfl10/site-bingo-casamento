export const COLUMNS = Object.freeze(['B', 'I', 'N', 'G', 'O']);
export const PRIZE_CATEGORIES = Object.freeze([...COLUMNS, 'Cartela Cheia']);
export const COLUMN_RANGES = Object.freeze({ B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] });
export const TOTAL_BALLS = 75;

export function normalizeProject(project) {
  if (!project || typeof project !== 'object' || !Array.isArray(project.cartelas) || project.cartelas.length === 0) {
    throw new Error('O JSON precisa conter uma lista de cartelas.');
  }
  const seen = new Set();
  const cards = project.cartelas.map((raw) => {
    const id = String(raw?.id ?? '').trim();
    if (!id || id.length > 40 || seen.has(id)) throw new Error('Cada cartela precisa ter um número único.');
    seen.add(id);
    const rows = Array.isArray(raw.linhas) ? raw.linhas : [];
    if (rows.length && (rows.length !== 5 || rows.some((row) => !Array.isArray(row) || row.length !== 5 || row.some((value) => value !== null && (!Number.isInteger(value) || value < 1 || value > TOTAL_BALLS))))) {
      throw new Error(`A cartela ${id} precisa ter uma grade válida de 5 × 5.`);
    }
    const columns = {};
    for (const letter of COLUMNS) {
      const supplied = raw.colunas?.[letter];
      const index = COLUMNS.indexOf(letter);
      const values = Array.isArray(supplied) ? supplied : rows.map((row) => Array.isArray(row) ? row[index] : null);
      if (values.length !== 5 || values.some((value) => value !== null && (!Number.isInteger(value) || value < 1 || value > TOTAL_BALLS))) {
        throw new Error(`A cartela ${id} tem números inválidos na coluna ${letter}.`);
      }
      const [minimum, maximum] = COLUMN_RANGES[letter];
      if (values.some((value) => value !== null && (value < minimum || value > maximum))) {
        throw new Error(`A cartela ${id} tem números fora da faixa da coluna ${letter}.`);
      }
      columns[letter] = values;
    }
    const boardRows = rows.length === 5 ? rows.map((row) => row.slice(0, 5)) : Array.from({ length: 5 }, (_, r) => COLUMNS.map((letter) => columns[letter][r]));
    return { id, columns, rows: boardRows };
  });
  return { cards, prizes: normalizePrizes(project.premios), sourceName: 'JSON importado' };
}

function normalizePrizes(prizes) {
  const clean = {};
  if (prizes && typeof prizes === 'object') {
    for (const [key, value] of Object.entries(prizes)) {
      if (typeof value === 'string' && value.trim()) clean[key] = value.trim().slice(0, 160);
    }
  }
  return clean;
}

export function makeInitialState(project) {
  const normalized = normalizeProject(project);
  return { version: 1, gameName: 'Bingo dos Noivos', cards: normalized.cards, prizes: normalized.prizes, called: [], purchased: [], closedPrizes: {}, sourceName: 'inputs/bingo_card_500_official.json' };
}

export function cleanState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.cards) || !Array.isArray(value.called) || !Array.isArray(value.purchased)) return null;
  try {
    const normalized = normalizeProject({ cartelas: value.cards.map((card) => ({ id: card.id, colunas: card.columns, linhas: card.rows })), premios: value.prizes });
    const ids = new Set(normalized.cards.map((card) => card.id));
    const called = [...new Set(value.called.filter((number) => Number.isInteger(number) && number >= 1 && number <= TOTAL_BALLS))];
    const purchased = [...new Set(value.purchased.map(String).filter((id) => ids.has(id)))];
    const closedPrizes = {};
    if (value.closedPrizes && typeof value.closedPrizes === 'object' && !Array.isArray(value.closedPrizes)) {
      for (const key of PRIZE_CATEGORIES) {
        if (Object.hasOwn(value.closedPrizes, key)) {
          const winnerId = value.closedPrizes[key];
          closedPrizes[key] = typeof winnerId === 'string' ? winnerId.trim().slice(0, 40) : '';
        }
      }
    }
    const savedName = typeof value.gameName === 'string' ? value.gameName.slice(0, 80) : 'Bingo dos Noivos';
    const gameName = savedName === 'Bingo do casamento' ? 'Bingo dos Noivos' : savedName;
    return { version: 1, gameName, cards: normalized.cards, prizes: normalized.prizes, called, purchased, closedPrizes, sourceName: typeof value.sourceName === 'string' ? value.sourceName.slice(0, 120) : 'JSON importado' };
  } catch { return null; }
}

export function columnFor(number) {
  return COLUMNS.find((letter) => number >= COLUMN_RANGES[letter][0] && number <= COLUMN_RANGES[letter][1]);
}

export function cardProgress(card, called) {
  const marked = new Set(called);
  const columns = COLUMNS.map((letter) => ({ letter, remaining: card.columns[letter].filter((number) => number !== null && !marked.has(number)).length }));
  const allNumbers = card.rows.flat().filter((number) => number !== null);
  return { columns, fullRemaining: allNumbers.filter((number) => !marked.has(number)).length };
}
