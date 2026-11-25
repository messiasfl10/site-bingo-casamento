# Configurar Supabase e Cloudflare Turnstile

Este tutorial configura a sincronização entre o painel público, o notebook e os celulares da equipe. O frontend continua estático; não é necessário criar um servidor próprio. As gravações são feitas por funções RPC no PostgreSQL, e o Supabase Auth valida o Turnstile no login.

## 1. Criar o projeto Supabase

1. Crie um projeto no [Supabase](https://supabase.com/dashboard) e escolha uma região próxima de onde o bingo será usado.
2. Em **Project Settings → API Keys** (ou no botão **Connect**), copie o **Project URL** e a chave **Publishable** (`sb_publishable_...`). A chave publishable é usada pelo site; ela não substitui as políticas RLS.
3. No painel do projeto, abra o **SQL Editor**, crie uma consulta, cole todo o conteúdo de `supabase/migrations/20261124000100_bingo_cloud.sql` e execute uma vez.

A migração cria jogos, cartelas, chamadas, prêmios encerrados, membros da equipe e auditoria. Também configura leitura pública do jogo ativo, RLS, permissões de equipe, RPCs transacionais e a publicação de Realtime. Não habilite escrita direta nas tabelas para `anon` ou `authenticated`.

### Por que existem RPCs

O frontend envia comandos como “marcar cartela comprada” ou “chamar bola” para funções SQL. Cada função verifica o papel da conta e faz a operação dentro de uma transação. A compra é atualizada somente se ainda estiver disponível, então dois vendedores que escanearem a mesma cartela quase ao mesmo tempo não conseguem confirmá-la duas vezes. A importação cria um jogo ativo novo em uma única transação; se uma cartela for inválida, o jogo anterior continua ativo.

As operações de compra, chamadas, encerramento de prêmio, reversão e importação precisam de RPC para que a autorização e as regras sejam aplicadas no servidor do banco. Não precisamos de Supabase Edge Functions para essas ações nem para o Turnstile usado no Supabase Auth.

## 2. Configurar autenticação por senha

1. Em **Authentication → Sign In / Providers**, habilite **Email** e autenticação por senha.
2. Desative inscrições públicas. A equipe não se cadastra pelo site; as contas serão criadas pela administração.
3. Em **Authentication → Users**, crie a conta da pessoa administradora e uma conta para cada vendedor. Defina senha e e-mail confirmado, conforme as opções oferecidas pelo painel.

Depois de criar cada conta, use o UUID da pessoa para associar o papel. Em **SQL Editor**, adapte e execute uma consulta por pessoa:

```sql
insert into public.staff_members (user_id, role, display_name)
select id, 'admin', 'Nome da pessoa administradora'
from auth.users
where email = 'admin@exemplo.com'
on conflict (user_id) do update
set role = excluded.role, display_name = excluded.display_name;
```

Para vendedores, troque `'admin'` por `'seller'` e informe o nome que aparecerá no cabeçalho. Use e-mails exatos das contas criadas. A conta `admin` pode gerenciar o bingo; `seller` só pode registrar cartelas compradas. Não conceda o papel pelo navegador.

## 3. Criar o widget Turnstile

1. No [painel Cloudflare](https://dash.cloudflare.com/), abra **Turnstile** e crie um widget para este site.
2. Na lista de hostnames, inclua o domínio publicado, sem protocolo nem caminho. Para o endereço padrão do GitHub Pages, inclua `messiasfl10.github.io`. Para testar localmente, inclua `localhost`. Se usar domínio próprio, inclua-o também.
3. Copie a **Site Key** e a **Secret Key** do widget.
4. No Supabase, abra **Project Settings → Authentication → Bot and Abuse Protection**, habilite CAPTCHA, selecione **Cloudflare Turnstile** e cole a **Secret Key**.

A Secret Key fica somente nas configurações do Supabase Auth. Não a copie para arquivos do projeto. O site usa apenas a Site Key pública, e o token de cada desafio é enviado junto com a tentativa de login para o Supabase validar.

## 4. Configurar o site

Edite `js/app-config.js`:

```js
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
export const TURNSTILE_SITE_KEY = '...';
```

Use o Project URL, a chave publishable e a Site Key copiados nos passos anteriores. Esses valores serão visíveis no navegador e podem ficar no repositório. **Nunca use `sb_secret_...`, `service_role` ou a Secret Key do Turnstile nesse arquivo.**

O cliente oficial JavaScript do Supabase é carregado de um CDN com versão fixada em `index.html`, `admin.html` e `vender.html`. O site precisa de conexão para baixar essa biblioteca, autenticar e sincronizar os dados.

## 5. Carregar o jogo inicial

O estado antigo guardado no `localStorage` de cada navegador não é importado automaticamente: esta implementação passa a consultar o Supabase. A carga inicial abaixo começa a partir do JSON e reinicia chamadas e compras. Se já houver vendas ou chamadas reais no armazenamento local, preserve esses dados antes de trocar o fluxo.

1. Publique o site com `js/app-config.js` configurado ou sirva a pasta localmente por HTTP.
2. Abra `admin.html` e entre com a conta de administrador.
3. Se não houver jogo ativo, selecione **Carregar JSON padrão**. Para usar outro projeto, importe o JSON do gerador.
4. Abra `index.html` e confirme que o painel público mostra o jogo. Entre em `vender.html` com uma conta de vendedor e confirme que as compras atualizam o painel.

O carregamento inicial não acontece automaticamente para visitantes. Isso impede que uma sessão anônima instale ou substitua o jogo central.

## 6. Publicar e operar

O site pode continuar hospedado no GitHub Pages. A configuração Supabase e Turnstile não exige Cloudflare Pages nem domínio Cloudflare. O widget Turnstile só precisa ter o hostname publicado autorizado.

Todos os dispositivos precisam de internet para confirmar alterações. Se um vendedor perder a conexão, a venda não será contabilizada até que seja registrada com conexão novamente; não há fila offline nesta versão. O painel indica a conexão no gerenciamento e na página de venda. Faça um ensaio com o notebook e os celulares na rede que será usada na festa.

As bolas e as compras são sincronizadas pelo Realtime. A página pública não pede login; as páginas de venda e gerenciamento exigem autenticação e papel adequado. O histórico de ações é visível apenas para administradores em `audit_events` pelo painel Supabase.

## 7. Cópia de segurança e operação

- Preserve o JSON original fora do Supabase.
- Antes da festa, confirme o projeto ativo, as contas dos vendedores, o widget Turnstile, a internet e o acesso à câmera HTTPS.
- Se uma venda foi atribuída incorretamente, a administração pode desfazê-la na lista de cartelas; o histórico permanece em `audit_events`.
- Para revogar uma pessoa, remova ou desative a conta em **Authentication → Users** e remova sua linha de `public.staff_members`.
- Não compartilhe chaves secretas. A chave publishable é pública; a segurança das tabelas depende das políticas e RPCs da migração.

## Referências oficiais

- [CAPTCHA no Supabase Auth](https://supabase.com/docs/guides/auth/auth-captcha)
- [Cloudflare Turnstile: criar um widget](https://developers.cloudflare.com/turnstile/get-started/)
- [Cloudflare Turnstile: validação de token](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Chaves da API do Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [Row Level Security no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
