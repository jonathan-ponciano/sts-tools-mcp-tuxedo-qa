---
name: tuxedo-qa
description: Write, run, self-heal, and monitor Playwright E2E tests for this project via the tuxedo-qa MCP toolkit. Checks whether tuxedo-qa is already installed/registered for this project and sets it up automatically if not, then follows this project's testing conventions (credentials helper, CPF/CNPJ generator, human-in-the-loop 2FA/WhatsApp/SMS, sandbox validation before a test can auto-run) to create or fix tests.
when_to_use: Use when the user wants to create a synthetic/E2E test, monitor a flow (login, checkout, lead capture, WhatsApp notification), fix a failing scheduled test, set up alerts (Discord/Slack/webhook), or asks things like "cria um teste pra esse fluxo", "monitora esse login", "configura o tuxedo-qa aqui", "testa esse fluxo de WhatsApp".
---

You are operating **tuxedo-qa**: an MCP server that manages a Playwright test suite (create, run, self-heal, schedule, alert) for this specific project. This skill both sets it up if needed and knows how to use it once it's there — never fall back to writing raw Playwright test files by hand outside its tools.

## Step 0 — confirm tuxedo-qa is actually connected for THIS project

Before anything else, check whether a tuxedo-qa MCP connection already exists and is live:

1. Use `ToolSearch` with query `tuxedoqa` — if tools like `mcp__tuxedoqa__*` or `mcp__tuxedoqa-<slug>__*` come back, it's already connected. Use whichever connection name matches this project (if several are registered, ask the user which one is this project's, unless obvious).
2. If nothing comes back, confirm via Bash: `claude mcp list 2>/dev/null | grep -i tuxedo` (or the Gemini CLI equivalent, `gemini mcp list`, if that's what the user has). Absence here means it's genuinely not installed for this project yet.

**If not installed**, offer to set it up and, once confirmed, run:

```bash
curl -fsSL https://raw.githubusercontent.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa/main/install.sh | bash
```

Ask first whether this install should track more than one app/project from one shared install (rare) — if yes, set `TUXEDO_QA_PROJECT=<slug>` before the command and re-run once per project. Otherwise the plain command above is enough for a single project.

**Critical:** after installing, the MCP connection needs a fresh process to actually load — it will NOT appear mid-session. Tell the user clearly: "Instalado. Preciso que você reconecte/reinicie sua sessão do Claude Code (ou abra uma nova) pra eu conseguir usar as ferramentas novas — me chame de novo com `/tuxedo-qa` depois disso." Then stop here; don't try to keep working as if the tools exist yet.

Once tools are confirmed available (from step 1 or 2), continue below.

## Tools you have

- `create_test` — writes a new test file. **Dry-runs it automatically before saving** — if the dry-run fails, you get the error back and the file is *not* saved; fix the code and call it again rather than reporting failure to the user immediately. New tests are sandboxed (`validated: false`) until a human confirms them — see "Sandbox" below.
- `list_tests` — lists tests with status; supports filtering by status/limit. Shows `DRAFT` for unvalidated tests.
- `read_test` — reads a test's current source.
- `update_test` — edits script, display name, description, schedule, credential, enabled state, or `validated`. **Dry-runs a script edit the same way `create_test` does** — a bad edit is rejected and the previous working code is restored. Editing the script always resets `validated` back to `false`, even if `validated: true` is passed in the same call.
- `delete_test` — permanent, irreversible. Always confirm with the user first; prefer `update_test` with `enabled: false` to deactivate instead.
- `run_tests` — runs all tests or one file; respects any active pause.
- `run_until_pass` — retries a failing test, applying its **own built-in heuristic fixes** (doubles timeouts on `TIMEOUT`, relaxes `toHaveURL` to a partial regex on `ASSERTION_FAILED`, adds a `waitForLoadState('networkidle')` on `NAVIGATION_ERROR`) between attempts. It does *not* call you to patch the code mid-loop — when none of its heuristics apply, it stops and returns a suggested-fix prompt. Read that, use `read_test` + `update_test` to apply a real fix, then call `run_tests` again.
- `get_status` — overall or per-test status; for a failing test, includes a `suggestedFixPrompt` telling you what kind of fix to try.
- `pause_tests` — pauses the whole suite for up to 60 minutes (auto-resumes). Use before a deploy so scheduled runs don't fire false alerts on infra that's mid-rollout.
- `set_webhook` — Discord, Slack, or generic-JSON webhook URL + `events: "failure"|"all"`. Once set, every *validated* test's run notifies automatically (with a failure screenshot attached for Discord).
- `create_credential` / `list_credentials` / `delete_credential` — named credential sets (key-value fields, e.g. `{ email, password }`) injected into test runs. **Never** put a real password or token directly in test code.
- `start_pair_debug` / `get_pair_debug_context` / `stop_pair_debug` — opens a visible browser for a human to drive by hand while console/network/errors/actions get recorded with timestamps; use when the user wants to walk through a flow live and have you spot the bug, or wants a draft test built from what they just did, instead of writing a scripted test upfront.

## Conventions for the test code you write

- Test files live flat in `tests/` (not in subfolders), so helpers are always a **same-directory** import — `./helpers/...`, not `../helpers/...`. Import credentials via the helper, never hardcode secrets:
  ```ts
  import { credentials } from './helpers/credentials.js';
  // credentials.EMAIL, credentials.PASSWORD, etc. — set the `credential` field
  // on create_test/update_test to the matching credential-set name so the
  // runner injects the right values at run time.
  ```
- Brazilian document test data: `generateCPF()`, `generateCNPJ()` (and `validateCPF`/`validateCNPJ`) from `./helpers/brasil.js` — use these instead of hardcoding fake CPF/CNPJ strings.
- A step that needs a human (SMS/WhatsApp/email 2FA code, OTP): `requestInput(label)` from `./helpers/human-loop.js` — it pauses the run and waits for the value to be supplied through the chat.
- Prefer resilient waits over fixed timeouts: `page.waitForLoadState('networkidle')`, `waitForURL(...)`, `expect(locator).toBeVisible()` before reading text — this is exactly what `run_until_pass`'s heuristics patch in after the fact, so writing it this way up front means fewer retries needed.
- Schedule choice: `1h` for revenue-critical flows (login, checkout, payment, lead capture), `6h` for important-but-secondary flows, `24h` (the default) for everything else.
- Tags: group related tests by feature area (e.g. `["checkout", "critical"]`) so `list_tests`/the dashboard stay organized as the suite grows.
- **Always set `display_name` and `description`** on `create_test` (or `update_test` if adding them later) — the filename alone doesn't tell anyone what it actually checks.

## Antes de escrever teste — pergunte uma vez, não a cada teste

**Isso é uma pergunta de setup por projeto, UMA VEZ por conversa — não repita pra cada teste/fluxo novo que criar depois.** Fazer o usuário responder a mesma coisa de novo a cada teste é exatamente o tipo de fricção que faz alguém desistir de usar isso num projeto grande.

Na primeira vez que for criar teste(s) nesta conversa, pergunte de uma vez (via `AskUserQuestion`, pode agrupar tudo num único lote de perguntas) e **guarde as respostas na memória da conversa** pra reaproveitar em todo teste que vier a criar depois, sem perguntar de novo:

- Qual URL alvo (dev/staging/produção)?
- Identidade de teste padrão: e-mail (ou padrão de domínio), nome, telefone; se o app usa CPF/CNPJ, valor "seguro" reconhecido por mock ou ok gerar um matematicamente válido?
- Serviços externos reais (CRM, SMS/WhatsApp, analytics, cobrança) que os fluxos deste projeto tendem a tocar, e a política padrão pra eles: mockar, só observar, ou pular a asserção?
- Credencial padrão pra login, e se 2FA/OTP é mockado ou precisa de humano via `requestInput()`.

**Nunca invente CNPJ/CPF/e-mail/telefone de teste por conta própria** — use o que foi respondido aqui. Isso existe porque pular essa pergunta já causou efeito colateral real em produção uma vez (um teste com e-mail "de teste" mal escolhido gerou contatos reais num CRM).

Só volte a perguntar sobre um item específico se um teste novo bater em algo que o setup inicial não cobriu. Não refaça a rodada inteira.

## Escopo antes de gerar em lote — combine, não dispare

Quando o pedido for algo como "cria testes pra esse projeto" (plural, projeto grande, sem lista fechada de fluxos), **negocie o escopo antes de escrever qualquer código**: pergunte quais fluxos cobrir (ou liste os que você identificou e confirme), quantos testes faz sentido pra uma primeira leva, e pare aí. Depois de cada leva pequena (3-5 testes é um bom tamanho), pare, resuma o que foi criado, e pergunte se continua pra próxima leva ou se ajusta algo antes.

## Tipos de fluxo com perguntas específicas

Além do checklist geral acima, alguns tipos de fluxo têm perguntas próprias:

### WhatsApp
- O WhatsApp entra como **envio** (o app manda notificação/OTP/cobrança pro usuário) ou **recebimento** (o fluxo espera o usuário responder/confirmar por WhatsApp pra continuar)?
- Qual integração o app usa (WhatsApp Business API oficial, Twilio, Z-API, outro gateway)? Isso diz qual domínio observar ou mockar na rede.
- Tem número de teste/sandbox, ou seria um número real? Mandar mensagem de teste pra um número de cliente de verdade é o mesmo tipo de risco do incidente do CRM acima — trate com a mesma cautela.
- Se o fluxo depende de receber um código real por WhatsApp: confirme que vai usar `requestInput()` pra um humano repassar o valor durante o teste.
- Prefira confirmar só que a chamada pra API do WhatsApp foi disparada (interceptar a request) a exigir entrega de verdade — mais barato, não depende de infra externa.

### SMS / código por e-mail (2FA genérico)
- Mockado com valor fixo em dev, ou humano real via `requestInput()`? Tem um código de teste fixo reconhecido pelo ambiente?

### Login / autenticação
- Credencial já existe (`create_credential`) ou precisa criar uma agora? Qual é o sinal de sucesso mais estável pra checar (URL, elemento específico, texto)?

### Checkout / pagamento
- Ambiente de pagamento é sandbox do gateway (Stripe test mode, PagSeguro sandbox, etc.) ou vai gerar cobrança real? Confirmar antes é inegociável. Usar dados de cartão oficiais de sandbox, nunca inventar um número.

### CRM / captura de lead
- Confirme domínio/ambiente de teste do CRM antes de rodar, e se tem como limpar o lead criado depois.

## Sandbox: new/edited tests don't fire on their own until validated

Every test starts (and every code edit resets it to) `validated: false`. While unvalidated, the scheduler will **never** pick it up automatically and the webhook stays quiet for it — no matter what `schedule`/`enabled` say. Manual runs (`run_tests`, `run_until_pass`, the dashboard's "Rodar" button) work exactly the same either way — that's *how* something gets validated in the first place.

After writing (or fixing) a test, tell the user it's sandboxed and to run it manually first. **Never call `update_test` with `validated: true` on your own inference** ("the dry-run passed, so it must be right") — a passing dry-run only means the code didn't crash, not that it's asserting the right thing. Only set it after the user explicitly confirms the result looks correct, or ask them to do it themselves via the dashboard's "Validar" button.

## Workflow patterns

- **New test from a description**: if this is the first test you're writing in this conversation, go through "Antes de escrever teste" above (once, not per test). If several tests/flows are being requested, go through "Escopo antes de gerar em lote" first. Then write the spec following the conventions above, and call `create_test` with a sensible `schedule`/`tags`/`credential`/`display_name`/`description`. If the dry-run fails, read the error, fix, retry. Once saved, remind the user it's sandboxed — ask them to run it manually and confirm before you (or they) mark it validated.
- **Fixing a failing scheduled test**: prefer `run_until_pass` first (cheap, handles the common cases). If it exhausts attempts, use its suggested-fix prompt (or `get_status`'s) to guide a real `update_test` edit, then confirm with `run_tests`.
- **Before a deploy**: `pause_tests` with a short duration and a `reason`, so scheduled monitoring doesn't fire during the rollout.
- **Alerting**: if the user wants notifications and hasn't set one up, offer `set_webhook` — Discord, Slack, or a generic JSON endpoint (Teams/email via an intermediary like Zapier).
- **Live debugging with a human**: if the user wants to walk through a flow themselves and have you spot what breaks, use `start_pair_debug` instead of writing a scripted test upfront — read the timeline with `get_pair_debug_context`, and `stop_pair_debug` gets you a draft test from what they did.
- **Multi-project setups**: if the matched connection's tool names are `mcp__tuxedoqa-<slug>__*`, you're scoped to that one project only — don't act on another project's tests.
- Point users to the local dashboard for a visual view — Monitor tab shows scheduler state and uptime; per-test modal shows full error/screenshot/logs and a "Validar" button.
