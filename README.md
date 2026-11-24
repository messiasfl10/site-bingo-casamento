# Bingo dos Noivos • Livia & Messias

Aplicação estática em HTML, CSS e JavaScript para acompanhar e gerenciar o Bingo dos Noivos. Não usa servidor de aplicação, banco de dados, login ou serviços externos.

**Versão:** 1.0.0

## Páginas

- `index.html`: painel público com as 75 bolas por coluna, últimas chamadas, prêmios e cartelas compradas próximas de completar uma coluna ou a cartela cheia. Prêmios entregues aparecem como encerrados e deixam de contar como chances.
- `admin.html`: importação de cartelas, registro e remoção de compras, leitura de QR-Code, chamadas e desfazer chamadas, encerramento/reabertura de prêmios, exclusão de cartelas e início de um novo jogo.

## Executar

Sirva a pasta raiz do repositório por HTTP local. Por exemplo, no VS Code, use a extensão Live Server e abra `index.html`. O JSON padrão fica em `inputs/bingo_card_500_official.json`. Módulos JavaScript, `fetch` e câmera não funcionam de forma confiável ao abrir o HTML diretamente com `file://`.

A câmera exige HTTPS ou `localhost` e depende do suporte do navegador à API `BarcodeDetector` para QR-Code. Se o navegador não oferecer essa API, o número da cartela pode ser digitado manualmente.

## Cartelas e jogo

Na primeira abertura, o sistema carrega o JSON padrão. Na tela **Gerenciar bingo**, importe outro JSON para substituir as cartelas e os prêmios atuais. O formato aceito segue o gerador deste projeto e contém `cartelas`, cada uma com `id` e uma grade 5 × 5 (`linhas`) ou colunas `B`, `I`, `N`, `G`, `O`. Valores de bola devem ser inteiros de 1 a 75; `null` representa o centro livre.

Uma cartela só concorre depois de ser marcada como comprada. O QR-Code pode conter o identificador isolado (por exemplo, `001`) ou texto/URL com o número. O painel de cartelas próximas considera somente cartelas compradas. Uma coluna aparece com até dois números faltando; cartela cheia aparece com até três. Ao completar um prêmio, a interface destaca a cartela como **BINGO!**.

Depois de confirmar a entrega de um prêmio, marque a categoria como entregue na página de gerenciamento. O painel público identifica a coluna encerrada, mostra a cartela vencedora quando informada e remove aquela categoria das chances de outras cartelas. O número da cartela vencedora é opcional; se preenchido, precisa estar comprada e ter completado o padrão com as bolas chamadas. Um novo jogo ou a importação de outro JSON reabre todas as categorias.

O estado é salvo no `localStorage` do navegador e sincronizado entre abas abertas na mesma origem. Limpar os dados do navegador apaga o jogo. O estado não é compartilhado com outros dispositivos; para uma operação com vários aparelhos é necessário adicionar armazenamento/sincronização no servidor. Exporte ou preserve o JSON original para manter uma cópia das cartelas.

## Estrutura

```text
index.html        painel público
admin.html        gerenciamento
css/bingo.css     tema e layout responsivo
assets/images/brand/
  couple-logo-primary.svg logo principal exibido no cabeçalho
  couple-logo-*.svg       variações de cor da identidade visual
js/
  bingo-domain.js  validação e regras de cartelas
  store.js         estado persistente e sincronização entre abas
  dashboard.js     renderização do painel público
  admin.js         ações administrativas e leitor de QR
  ui.js            utilitários de interface
releases/          notas por versão
```

## Privacidade e segurança

- Os dados do bingo ficam no navegador, sem envio a uma API.
- JSON importado é validado antes de substituir o jogo. IDs, dimensões da grade e números são conferidos.
- Conteúdo vindo de cartelas e arquivos é apresentado com `textContent` e nós DOM; não é interpolado em `innerHTML`.
- O leitor solicita apenas vídeo da câmera, sem áudio, e encerra a captura ao fechar a câmera ou sair da página.
- O acesso de gerenciamento é apenas uma divisão de interface, não uma barreira de autorização. Não publique informações sensíveis esperando que essa página seja privada.

## Versões

Consulte [notas de versão](releases/README.md). A versão atual é a **1.0.0**.
