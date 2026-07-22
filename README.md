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
