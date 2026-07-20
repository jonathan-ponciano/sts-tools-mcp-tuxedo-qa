# tuxedo-qa

Servidor MCP que permite ao [Claude](https://claude.com), [Gemini](https://gemini.google.com) e
outros assistentes de IA compatíveis com MCP criar, rodar, autocorrigir e monitorar testes
[Playwright](https://playwright.dev) do seu app — com dashboard local, cofre de credenciais
e página pública de status.

**[Landing page e documentação →](https://jonathan-ponciano.github.io/sts-tools-mcp-tuxedo-qa/)**

## O que é

O tuxedo-qa expõe 13 ferramentas MCP que cobrem todo o ciclo de vida de uma suíte de testes
sintéticos: escrever specs em linguagem natural, rodar sob demanda ou por agendamento,
autocorrigir falhas, acessar ambientes de staging protegidos por headers, e expor os
resultados numa página pública de status — tudo conduzido por uma conversa com seu
assistente de IA, sem precisar de pipeline de CI.

Veja a [referência completa das ferramentas e casos de uso](https://jonathan-ponciano.github.io/sts-tools-mcp-tuxedo-qa/#tools)
na landing page.

## Como começar

```bash
git clone https://github.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa.git
cd sts-tools-mcp-tuxedo-qa
npm install
npm run build
```

Registre como servidor MCP. No Claude Code:

```bash
claude mcp add tuxedoqa -- node "$(pwd)/dist/index.js"
```

No Gemini CLI:

```bash
gemini mcp add tuxedoqa -- node "$(pwd)/dist/index.js"
```

Opcionalmente, inicie o dashboard local:

```bash
npm run dashboard
# → http://localhost:3131
```

## Desenvolvimento

```bash
npm run dev         # roda o servidor MCP com tsx (sem build)
npm run dashboard    # dashboard em modo dev
npm test             # roda a suíte Playwright diretamente
```

## Licença

MIT
