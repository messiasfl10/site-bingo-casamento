import { getState, initialize, purchaseCard, subscribe, subscribeConnection } from './store.js';
import { mountStaffGate } from './staff-auth.js';
import { showToast } from './ui.js';

let stream = null;
let busy = false;

function render(state) {
  document.getElementById('seller-total').textContent = String(state?.cards.length ?? 0);
  document.getElementById('seller-purchased').textContent = String(state?.purchased.length ?? 0);
  document.getElementById('seller-sync-status').textContent = state ? 'Conectado ao jogo' : 'Aguardando jogo';
  document.getElementById('card-number').disabled = !state || busy;
  document.getElementById('purchase-button').disabled = !state || busy;
  document.getElementById('start-scan').disabled = !state || busy;
}

function cardForCode(rawValue) {
  const value = rawValue.trim();
  if (!value) throw new Error('Digite o número da cartela.');
  const state = getState();
  if (!state) throw new Error('Ainda não há um jogo carregado. Peça à pessoa administradora para importar o JSON.');
  const direct = state.cards.find((card) => card.id.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'));
  const digits = value.match(/\d+/g);
  const extracted = digits?.at(-1);
  const card = direct || state.cards.find((item) => item.id === extracted || (extracted && item.id === extracted.replace(/^0+(?=\d)/, '')));
  if (!card) throw new Error(`A cartela “${value.slice(0, 40)}” não está neste jogo.`);
  if (state.purchased.includes(card.id)) throw new Error(`A cartela ${card.id} já foi registrada por outra pessoa.`);
  return card;
}

async function registerCard(rawValue) {
  const card = cardForCode(rawValue);
  busy = true;
  render(getState());
  try {
    await purchaseCard(card.id);
    document.getElementById('card-number').value = '';
    showFeedback(`Cartela ${card.id} confirmada como comprada.`, 'success');
  } finally {
    busy = false;
    render(getState());
  }
}

function showFeedback(message, kind) {
  const feedback = document.getElementById('purchase-feedback');
  feedback.textContent = message;
  feedback.className = `feedback ${kind}`;
}

document.getElementById('card-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await registerCard(document.getElementById('card-number').value); }
  catch (error) { showFeedback(error.message, 'error'); }
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

async function startSeller() {
  try {
    render(await initialize());
    subscribe(render);
    subscribeConnection((status) => {
      document.getElementById('seller-sync-status').textContent = status === 'connected' ? 'Conectado ao jogo' : status === 'disconnected' ? 'Sem conexão com a nuvem' : 'Conectando ao jogo';
    });
  }
  catch (error) { document.getElementById('seller-sync-status').textContent = 'Falha na conexão'; showToast(error.message, 'error'); }
}
mountStaffGate('seller', startSeller).catch((error) => showToast(error.message, 'error'));
