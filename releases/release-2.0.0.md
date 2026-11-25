# Bingo dos Noivos • 2.0.0

Lançada em 24 de novembro de 2026.

## Sincronização entre dispositivos

- Supabase passa a manter o estado central do bingo e propagar atualizações em tempo real entre painel público, administração e celulares da equipe.
- Nova página `vender.html` para vendedores registrarem compras com leitor de QR-Code ou número da cartela.
- Autenticação da equipe com papéis `admin` e `seller`; o painel público permanece somente para leitura e sem login.
- Cloudflare Turnstile integrado ao login do Supabase Auth para reduzir tentativas automatizadas.
- Políticas RLS e RPCs transacionais protegem vendas, chamadas, prêmios, importações e início de novos jogos.
- Histórico de ações em `audit_events` e retenção dos jogos importados anteriormente.
- Migração SQL e tutorial de configuração em `supabase/migrations/` e `docs/CONFIGURAR_SUPABASE.md`.

## Configuração necessária

É preciso criar e configurar o projeto Supabase e o widget Turnstile, aplicar a migração SQL e preencher URL/chave publishable/Site Key em `js/app-config.js`. O estado local de versões anteriores não é migrado automaticamente; a carga inicial começa pelo JSON.
