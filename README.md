# Bingo dos Noivos • Livia & Messias

Aplicação estática em HTML, CSS e JavaScript para acompanhar e gerenciar o Bingo dos Noivos. O site pode ser hospedado no GitHub Pages; Supabase centraliza o jogo e sincroniza os dispositivos; Cloudflare Turnstile protege o acesso da equipe contra tentativas automatizadas.

**Versão:** 2.0.0

## Páginas

- `index.html`: painel público com bolas chamadas, últimas chamadas, prêmios e cartelas compradas próximas de completar um prêmio.
- `admin.html`: gerenciamento protegido para importar jogos, controlar bolas, encerrar prêmios e administrar cartelas.
- `vender.html`: tela simplificada para vendedores registrarem compras pelo QR-Code ou número da cartela.

## Configuração e publicação

Siga o [tutorial de configuração do Supabase e Turnstile](docs/CONFIGURAR_SUPABASE.md). Ele cobre a criação do projeto, a aplicação da migração SQL, as contas e papéis da equipe, as chaves, o widget Turnstile e a carga inicial do JSON.

Configure `js/app-config.js` com a URL e a chave publishable do Supabase e a Site Key do Turnstile. Esses valores identificam o projeto e o widget; a proteção dos dados depende das regras RLS instaladas pela migração. **Nunca coloque uma chave secret/service role ou o segredo do Turnstile no JavaScript.**

Para desenvolvimento, sirva a pasta por HTTP/HTTPS (por exemplo, com a extensão Live Server do VS Code) e permita `localhost` na lista de domínios do widget Turnstile. Não abra o site com `file://`. O site, o Supabase, o serviço Turnstile e a leitura de QR precisam de conexão com a internet durante a operação. Sem conexão, as gravações não são confirmadas nem armazenadas como vendas pendentes.

## Como os dados funcionam

Na primeira configuração, uma pessoa administradora entra em `admin.html` e seleciona **Carregar JSON padrão**. Para iniciar outro jogo, pode importar um JSON do gerador. Cada importação cria um novo jogo ativo atomicamente; os jogos anteriores e o histórico permanecem no banco.

O painel público consulta o jogo ativo sem login. Vendedores entram em `vender.html`; administradores entram em `admin.html`. Vendedores só podem registrar compras. A administração também controla bolas, prêmios, importação, remoção de cartelas e início de jogo. Atualizações são transmitidas entre os dispositivos conectados pelo Supabase Realtime.

O banco guarda grades das cartelas, bolas chamadas, compras, prêmios encerrados e eventos de auditoria. O navegador mantém a sessão de autenticação da equipe; o estado oficial do bingo fica no Supabase. A leitura do painel público expõe os dados das cartelas do jogo ativo usados para calcular as chances, mas não guarda nomes de compradores.

## Prévia ao compartilhar

As páginas incluem metadados Open Graph e Twitter Cards para mostrar título, descrição e capa no WhatsApp e em outros aplicativos. A imagem fica em `assets/images/cover/cover.jpg`. Os metadados usam o endereço padrão do GitHub Pages (`https://messiasfl10.github.io/site-bingo-casamento/`); se o site mudar de domínio ou hospedagem, atualize `og:url`, `og:image` e `twitter:image` em `index.html` e `admin.html`. Aplicativos podem manter a prévia em cache depois da publicação.

## Segurança

- RLS permite leitura pública apenas do jogo ativo e restringe gravações às funções RPC com papéis de equipe.
- As permissões `admin` e `seller` ficam em `staff_members`; não há cadastro público de equipe.
- As RPCs conferem papel e invariantes no banco e executam cada mudança como uma transação. Isso evita atualizações concorrentes perderem vendas, chamadas ou importações.
- Turnstile protege o login da equipe integrado ao Supabase Auth. Ele não substitui a autorização por papel nem as políticas RLS.
- O cliente usa somente a chave publishable. Segredos do Supabase e do Turnstile permanecem nos respectivos painéis de serviço.
- Conteúdo vindo de cartelas e arquivos é criado com nós DOM e `textContent`; não é interpolado em `innerHTML`.
- O acesso à câmera pede somente vídeo e encerra a captura ao fechar o leitor ou sair da página.

## Estrutura

```text
index.html                 painel público
admin.html                 administração autenticada
vender.html                registro de vendas para a equipe
css/bingo.css              tema e layout responsivo
assets/images/brand/       variações do logo
assets/images/cover/       imagem para prévia de compartilhamento
inputs/                    JSON padrão de cartelas
js/app-config.js           URL/chave pública do Supabase e Site Key do Turnstile
js/supabase-client.js      cliente Supabase
js/store.js                leitura, sincronização e comandos de dados
js/staff-auth.js           autenticação e proteção das páginas da equipe
js/bingo-domain.js         validação e regras de cartelas
js/dashboard.js            renderização do painel público
js/admin.js                ações administrativas
js/seller.js               registro de vendas e leitor QR
js/ui.js                   utilitários de interface
supabase/migrations/       tabelas, RLS e RPCs
docs/                      tutoriais de configuração
releases/                  notas por versão
```

## Versões

Consulte [notas de versão](releases/README.md). A versão atual é **2.0.0**.

## Autoria

Desenvolvido por **Messias D. P. de M. Filho**. GitHub: [github.com/messiasfl10](https://github.com/messiasfl10/).
