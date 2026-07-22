# tuxedo-qa

Servidor MCP que permite ao [Claude](https://claude.com), [Gemini](https://gemini.google.com) e
outros assistentes de IA compatíveis com MCP criar, rodar, autocorrigir e monitorar testes
[Playwright](https://playwright.dev) do seu app — com dashboard local, cofre de credenciais
e página pública de status.

**[Landing page e documentação →](https://jonathan-ponciano.github.io/sts-tools-mcp-tuxedo-qa/)**

## O que é

O tuxedo-qa expõe 17 ferramentas MCP que cobrem todo o ciclo de vida de uma suíte de testes
sintéticos: escrever specs em linguagem natural, rodar sob demanda ou por agendamento,
autocorrigir falhas, acessar ambientes de staging protegidos por headers, e expor os
resultados numa página pública de status — tudo conduzido por uma conversa com seu
assistente de IA, sem precisar de pipeline de CI.

Veja a [referência completa das ferramentas e casos de uso](https://jonathan-ponciano.github.io/sts-tools-mcp-tuxedo-qa/#tools)
na landing page.

### Skill do Claude Code — `/tuxedo-qa`

O instalador também registra a skill **`tuxedo-qa`** (globalmente, em `~/.claude/skills/`) —
rode `/tuxedo-qa` em qualquer projeto (ou só descreva o que quer testar; ela aciona sozinha
pelo contexto). Ela mesma confere se já existe uma conexão MCP registrada pra esse projeto e
oferece pra instalar se não tiver, já sabe as 17 ferramentas, as convenções de teste do
projeto (usar o helper de credenciais em vez de senha fixa, `brasil.ts` pra CPF/CNPJ,
`human-loop.ts` pra 2FA/WhatsApp/SMS) e quando usar `run_until_pass` vs. corrigir manualmente.
(Só Claude Code por enquanto — o Gemini CLI não tem esse mecanismo de skills ainda.)

## Como começar

Roda em [Bun](https://bun.sh) — sem etapa de build, o servidor executa o TypeScript direto
da fonte. Instale o Bun primeiro se ainda não tiver: `curl -fsSL https://bun.sh/install | bash`.

Instalador de um comando só — clona/atualiza e registra automaticamente
no Claude Code e/ou Gemini CLI (o que você tiver instalado):

```bash
curl -fsSL https://raw.githubusercontent.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa/main/install.sh | bash
```

Instala em `~/tuxedo-qa` por padrão (mude com `TUXEDO_QA_DIR=/outro/caminho`). Rodar de
novo atualiza a instalação existente — seguro de repetir.

<details>
<summary>Instalação manual</summary>

```bash
git clone https://github.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa.git
cd sts-tools-mcp-tuxedo-qa
bun install
```

Registre como servidor MCP. No Claude Code (escopo `user` = disponível em todos os projetos):

```bash
claude mcp add tuxedoqa --scope user -- bun "$(pwd)/src/index.ts"
```

No Gemini CLI (sem `--` antes do comando — sintaxe diferente do Claude Code):

```bash
gemini mcp add tuxedoqa bun "$(pwd)/src/index.ts" --scope user
```

Configuração equivalente em JSON, se seu cliente MCP usar esse formato (Claude Code, Gemini CLI,
Antigravity, opencode):

```json
{
  "mcpServers": {
    "tuxedoqa": {
      "command": "bun",
      "args": ["/caminho/absoluto/para/tuxedo-qa/src/index.ts"]
    }
  }
}
```

No Cursor e em outras ferramentas que usam a chave `mcp.servers` em vez de `mcpServers`:

```json
{
  "mcp.servers": {
    "tuxedoqa": {
      "command": "bun",
      "args": ["/caminho/absoluto/para/tuxedo-qa/src/index.ts"]
    }
  }
}
```

</details>

Opcionalmente, inicie o dashboard local:

```bash
bun run dashboard
# → http://localhost:3131
```

## Monitorando mais de um app/cliente

Uma instalação só do tuxedo-qa serve quantos projetos você quiser, cada um **completamente
isolado** (testes, credenciais, schedule, histórico próprios), com **um dashboard só** pra
ver e gerenciar todos eles juntos. A ideia:

- Cada projeto tem sua própria conexão MCP (o Claude/Gemini "conectado" naquele projeto
  específico só enxerga e mexe nos testes daquele projeto).
- O dashboard (`bun run dashboard`) não pertence a nenhum projeto — ele enxerga todos ao
  mesmo tempo, com um seletor pra trocar de contexto.
- O scheduler (monitoramento automático) roda dentro do dashboard e cuida de **todos os
  projetos ao mesmo tempo**, cada um no seu próprio horário.

### 1. Registrar um novo projeto

Rode o instalador de novo, passando um slug em `TUXEDO_QA_PROJECT` (letras, números, `-`/`_`).
Ele reaproveita a mesma instalação (mesmo clone, mesmo `node_modules`) e só registra uma nova
conexão MCP:

```bash
TUXEDO_QA_PROJECT=fretebras bash install.sh
# → registra o servidor MCP "tuxedoqa-fretebras"

TUXEDO_QA_PROJECT=xtagger bash install.sh
# → registra o servidor MCP "tuxedoqa-xtagger"
```

Repita pra cada projeto/cliente novo. Os dados de cada um ficam isolados em
`projects/<slug>/` dentro da instalação (`~/tuxedo-qa/projects/fretebras/`,
`~/tuxedo-qa/projects/xtagger/`, etc.) — testes, credenciais, schedule e histórico
nunca se misturam entre projetos.

### 2. Usar cada projeto pelo Claude/Gemini

Depois de registrado, abra uma conversa e escolha a conexão MCP certa pra cada projeto
(`tuxedoqa-fretebras` quando estiver falando sobre o Fretebras, `tuxedoqa-xtagger` pro
xtagger). Cada uma só cria/roda/lê testes do seu próprio projeto — não tem como um
misturar com o outro por acidente.

### 3. Ver tudo junto no dashboard

Suba o dashboard uma vez só (ele não precisa de `TUXEDO_QA_PROJECT` nenhum — enxerga todos
sozinho):

```bash
bun run dashboard
# → http://localhost:3131
```

Na aba **Monitor** tem uma visão geral com todos os projetos (quantos testes, uptime,
o que tá rodando agora). Clicar num projeto ali — ou usar o seletor no topo da página —
troca o contexto do resto do dashboard (abas Testes, Credenciais, Proteção, Status Page)
pra aquele projeto específico. É o mesmo dashboard, só muda o que ele mostra.

### 4. Monitoramento automático

O scheduler roda dentro do processo do dashboard e verifica **todos os projetos a cada
minuto** — não importa qual está selecionado na tela no momento. Se `fretebras` tem um
teste agendado a cada 1h e `xtagger` tem um a cada 6h, os dois rodam nos seus próprios
horários, de forma independente, enquanto o dashboard estiver de pé.

### Sem `TUXEDO_QA_PROJECT`

Se você só tem um projeto, não precisa mexer em nada disso — sem essa variável, tudo
funciona no modo padrão (um projeto só, sem namespace), exatamente como antes.

## Integração com GitHub Actions (webhook por fluxo)

Dá pra disparar um teste específico a partir de um webhook externo (ex: deploy da Vercel
concluído) via [`repository_dispatch`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#repository_dispatch)
do GitHub Actions.

⚠️ **O workflow e o runner precisam ficar no repositório do projeto sendo testado — nunca
neste repositório do tuxedo-qa, que é público.** O GitHub recomenda explicitamente não
registrar [self-hosted runners em repositórios públicos](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#self-hosted-runner-security-with-public-repositories)
— qualquer PR de fora poderia rodar código na sua máquina. Um runner auto-hospedado é
necessário aqui porque os testes/credenciais do tuxedo-qa vivem só localmente na máquina
onde ele está instalado (de propósito — nunca são commitados em lugar nenhum), então um
runner hospedado pelo próprio GitHub não teria acesso a eles.

1. Registre a máquina onde o tuxedo-qa está instalado como
   [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners)
   do repositório (privado) do projeto sendo testado.

2. Copie esse workflow pra `.github/workflows/tuxedo-qa-dispatch.yml` nesse mesmo repositório:

   ```yaml
   name: tuxedo-qa dispatch
   on:
     repository_dispatch:
       types: [tuxedo-qa-run]

   jobs:
     run-test:
       runs-on: self-hosted
       steps:
         - name: Rodar o fluxo pedido
           working-directory: /caminho/para/tuxedo-qa   # ajuste pro caminho real da instalação
           env:
             TUXEDO_QA_PROJECT: ${{ github.event.client_payload.project }}
             TUXEDO_CI_TEST: ${{ github.event.client_payload.flow }}
           run: bun scripts/ci-run-test.mjs
   ```

3. Dispare de qualquer lugar (webhook de deploy, outro workflow, curl manual) com um
   [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
   que tenha permissão `repo` nesse repositório:

   ```bash
   curl -X POST \
     -H "Accept: application/vnd.github+json" \
     -H "Authorization: Bearer <SEU_TOKEN>" \
     https://api.github.com/repos/<owner>/<repo>/dispatches \
     -d '{"event_type":"tuxedo-qa-run","client_payload":{"flow":"login-checkout","project":"fretebras"}}'
   ```

   `flow` é o nome do arquivo de teste sem `.spec.ts` (omita pra rodar todos os testes
   habilitados do projeto); `project` é o slug usado em `TUXEDO_QA_PROJECT` (omita pro
   projeto padrão/sem namespace).

`scripts/ci-run-test.mjs` chama o mesmo `run_tests` que o dashboard e o chat usam —
resultado, histórico e webhook (Discord/Slack/genérico) configurado funcionam exatamente
igual a uma execução manual. **Não** confere o flag `validated` do sandbox (isso continua
só protegendo o scheduler automático e as notificações de teste ainda não validado,
exatamente como já funciona hoje) — um disparo via webhook é uma ação deliberada de quem
configurou o workflow, no mesmo nível de confiança de clicar "Rodar" no dashboard.

## Desenvolvimento

```bash
bun run start        # roda o servidor MCP (sem build — Bun executa o TS direto)
bun run dashboard    # dashboard
bun run typecheck    # tsc --noEmit, só pra conferir tipos
bun run test         # roda a suíte Playwright diretamente
```

⚠️ Sempre `bun run test`, nunca `bun test` sem o `run` — `bun test` sozinho aciona o test
runner **nativo** do Bun (que colide com o `test()` global do Playwright e quebra); `bun run
test` executa o script `"test"` do `package.json` (`playwright test`), que é o que você quer.

## Navegador headless vs. visível

Por padrão, todo teste roda **headless** — o Chromium abre em background, sem janela
nenhuma na tela. Pra acompanhar visualmente o que o teste está fazendo (útil pra debugar
um fluxo novo), basta passar a flag `PWHEADED=1` antes do comando:

```bash
bun run test                # headless (padrão)
PWHEADED=1 bun run test     # abre o navegador visível
PWHEADED=1 bun run start    # mesma flag funciona rodando via o servidor MCP
```

Isso vale pra qualquer execução — manual, via dashboard, ou disparada pelo Claude/Gemini
com `run_tests`/`run_until_pass`/`create_test` — porque todas passam pelo mesmo runner
(`src/lib/playwright-runner.ts`), que lê `playwright.config.ts`.

## Licença

MIT
