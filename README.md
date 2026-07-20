# tuxedo-qa

MCP server that lets [Claude](https://claude.com), [Gemini](https://gemini.google.com), and
other MCP-compatible AI assistants create, run, self-heal, and monitor
[Playwright](https://playwright.dev) tests for your web app — with a local dashboard,
a credential vault, and a public status page.

**[Landing page & docs →](https://jonathan-ponciano.github.io/sts-tools-mcp-tuxedo-qa/)**

## What it is

tuxedo-qa exposes 13 MCP tools covering the full lifecycle of a synthetic test suite:
write specs in natural language, run them on demand or on a schedule, self-heal failures,
gate staging environments behind protection headers, and surface results on a public
status page — all driven from a conversation with your AI assistant, no CI pipeline required.

See the [full tool reference and use cases](https://jonathan-ponciano.github.io/sts-tools-mcp-tuxedo-qa/#tools)
on the landing page.

## Quickstart

```bash
git clone https://github.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa.git
cd sts-tools-mcp-tuxedo-qa
npm install
npm run build
```

Register it as an MCP server. For Claude Code:

```bash
claude mcp add tuxedoqa -- node "$(pwd)/dist/index.js"
```

For Gemini CLI:

```bash
gemini mcp add tuxedoqa -- node "$(pwd)/dist/index.js"
```

Optionally start the local dashboard:

```bash
npm run dashboard
# → http://localhost:3131
```

## Development

```bash
npm run dev        # run the MCP server with tsx (no build step)
npm run dashboard   # dashboard dev server
npm test            # run the Playwright suite directly
```

## License

MIT
