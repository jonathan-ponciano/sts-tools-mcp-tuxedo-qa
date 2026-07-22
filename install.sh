#!/usr/bin/env bash
# tuxedo-qa installer — clones/updates, builds, and registers the MCP
# server with whichever AI CLI(s) you have installed (Claude Code, Gemini CLI).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa/main/install.sh | bash
#
# Env vars:
#   TUXEDO_QA_DIR      install location (default: $HOME/tuxedo-qa) — shared by all projects
#   TUXEDO_QA_PROJECT  project slug — set this to monitor more than one app/client from the
#                      same install. Each slug gets its own isolated tests/config/results
#                      under projects/<slug>/. Re-run this script once per project, with a
#                      different TUXEDO_QA_PROJECT each time, to register all of them.
#   TUXEDO_QA_NAME     MCP server name to register (default: tuxedoqa, or tuxedoqa-<project>)
#
# Example, two clients sharing one install:
#   TUXEDO_QA_PROJECT=cliente-a bash install.sh
#   TUXEDO_QA_PROJECT=cliente-b bash install.sh

set -euo pipefail

REPO_URL="https://github.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa.git"
INSTALL_DIR="${TUXEDO_QA_DIR:-$HOME/tuxedo-qa}"
PROJECT="${TUXEDO_QA_PROJECT:-}"
MCP_NAME="${TUXEDO_QA_NAME:-$([ -n "$PROJECT" ] && echo "tuxedoqa-$PROJECT" || echo "tuxedoqa")}"

info() { printf '\033[1;34m▸\033[0m %s\n' "$1"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$1"; }
err()  { printf '\033[1;31m✘\033[0m %s\n' "$1" >&2; }

require() {
  command -v "$1" >/dev/null 2>&1 || { err "\"$1\" não encontrado no PATH. Instale antes de continuar."; exit 1; }
}

require git
require node
require npm

info "Instalando tuxedo-qa em $INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Instalação existente encontrada — atualizando..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
info "Instalando dependências (npm install)..."
npm install
info "Buildando (npm run build)..."
npm run build

DIST_ENTRY="$INSTALL_DIR/dist/index.js"

# Each CLI has its own `mcp add` syntax (Claude Code wants "--" before the
# command; Gemini CLI doesn't and uses different scope values), so build the
# add command per-CLI rather than sharing one command line.
add_command_for() {
  local env_args=""
  [ -n "$PROJECT" ] && env_args="-e TUXEDO_QA_PROJECT=$PROJECT"
  case "$1" in
    claude) echo "claude mcp add $MCP_NAME --scope user $env_args -- node \"$DIST_ENTRY\"" ;;
    gemini) echo "gemini mcp add $MCP_NAME node \"$DIST_ENTRY\" --scope user $env_args" ;;
  esac
}

# Registers with one AI CLI. Never lets a failed/duplicate registration
# abort the whole install — reports it and moves on.
register() {
  local cli="$1"
  command -v "$cli" >/dev/null 2>&1 || return 1

  local cmd; cmd="$(add_command_for "$cli")"
  local log; log="$(mktemp)"
  if eval "$cmd" >"$log" 2>&1; then
    ok "$cli: registrado como \"$MCP_NAME\""
  elif grep -qi "already exists\|already registered\|duplicate" "$log"; then
    warn "$cli: \"$MCP_NAME\" já estava registrado — pulando (remova com \"$cli mcp remove $MCP_NAME\" pra reinstalar do zero)."
  else
    warn "$cli: não deu pra registrar automaticamente. Rode manualmente:"
    echo "    $cmd"
    sed 's/^/    /' "$log"
  fi
  rm -f "$log"
  return 0
}

registered_any=false
register claude  && registered_any=true
register gemini  && registered_any=true

if [ "$registered_any" = false ]; then
  warn "Nem \"claude\" nem \"gemini\" encontrados no PATH. Registre manualmente quando tiver uma dessas CLIs:"
  echo "    $(add_command_for claude)"
  echo "    $(add_command_for gemini)"
fi

# Claude Code skill: invoke with /tuxedo-qa in any project. It checks for an
# existing MCP connection itself (and offers to install one if missing), then
# knows the full toolkit and this project's testing conventions — no need to
# explain them every session. Global (~/.claude/skills), so it's available
# everywhere, same as the MCP server's --scope user. Gemini CLI has no
# equivalent mechanism yet.
if command -v claude >/dev/null 2>&1; then
  mkdir -p "$HOME/.claude/skills/tuxedo-qa"
  cp "$INSTALL_DIR/.claude/skills/tuxedo-qa/SKILL.md" "$HOME/.claude/skills/tuxedo-qa/SKILL.md"
  ok "Skill \"/tuxedo-qa\" instalada em ~/.claude/skills/ (Claude Code)"
fi

echo ""
ok "tuxedo-qa instalado em $INSTALL_DIR"
[ -n "$PROJECT" ] && echo "   Projeto: $PROJECT (tests/config isolados em projects/$PROJECT/)"
echo ""
echo "Próximos passos:"
echo "  1. Reinicie/reconecte sua CLI de IA pra carregar o servidor MCP novo."
echo "  2. (Opcional) inicie o dashboard — um só, mesmo com vários projetos registrados,"
echo "     ele já mostra todos com um seletor pra trocar de contexto:"
echo "       cd \"$INSTALL_DIR\" && npm run dashboard"
echo "  3. Rode /tuxedo-qa no chat (ou só descreva o fluxo) pra criar o primeiro teste."
if [ -n "$PROJECT" ]; then
  echo "  4. Pra registrar outro projeto depois: TUXEDO_QA_PROJECT=<outro-slug> bash install.sh"
fi
