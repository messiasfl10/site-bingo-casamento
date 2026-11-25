# Bingo dos Noivos • 2.0.0

Lançada em 24 de novembro de 2026. Notas atualizadas em 25 de novembro de 2026.

## Sincronização entre dispositivos

- Supabase passa a manter o estado central do bingo e propagar atualizações em tempo real entre painel público, administração e celulares da equipe.
- Nova página `vender.html` para vendedores registrarem compras com leitor de QR-Code ou número da cartela.
- Autenticação da equipe com papéis `admin` e `seller`; o painel público permanece somente para leitura e sem login.
- Cloudflare Turnstile integrado ao login do Supabase Auth para reduzir tentativas automatizadas.
- Políticas RLS e RPCs transacionais protegem vendas, chamadas, prêmios, importações e início de novos jogos.
- Histórico de ações em `audit_events` e retenção dos jogos importados anteriormente.
- Migração SQL e tutorial de configuração em `supabase/migrations/` e `docs/CONFIGURAR_SUPABASE.md`.
- Logo pequena do casamento e crédito de desenvolvimento com link para GitHub no rodapé público e nos acessos da equipe.

## Painel público

- Controle para alternar entre a visualização detalhada, padrão, e a simplificada.
- A visão simplificada destaca o painel de bolas, as últimas chamadas, as cartelas no páreo e os prêmios em cards.
- No desktop, **Últimas bolas** e **Prêmios** ficam empilhadas ao lado de **Cartelas no páreo**; o card das cartelas acompanha a altura combinada das seções à esquerda. No mobile, o conteúdo segue em uma coluna.
- A seção de últimas chamadas mantém a bola mais recente em destaque e mostra até seis bolas anteriores centralizadas.
- A lista de cartelas próximas de ganhar considera apenas cartelas compradas e prêmios ainda disponíveis.
- Quando uma cartela comprada completa um prêmio disponível, o painel exibe fogos de artifício e cartelas animadas. A animação respeita a preferência do sistema por movimento reduzido.

## Configuração necessária

É preciso criar e configurar o projeto Supabase e o widget Turnstile, aplicar a migração SQL e preencher URL/chave publishable/Site Key em `js/app-config.js`. O estado local de versões anteriores não é migrado automaticamente; a carga inicial começa pelo JSON.
