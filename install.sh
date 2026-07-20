#!/usr/bin/env bash
# tuxedo-qa installer — clones/updates, builds, and registers the MCP
# server with whichever AI CLI(s) you have installed (Claude Code, Gemini CLI).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa/main/install.sh | bash
#
# Env vars:
#   TUXEDO_QA_DIR   install location (default: $HOME/tuxedo-qa)
#   TUXEDO_QA_NAME  MCP server name to register (default: tuxedoqa)

set -euo pipefail

REPO_URL="https://github.com/jonathan-ponciano/sts-tools-mcp-tuxedo-qa.git"
INSTALL_DIR="${TUXEDO_QA_DIR:-$HOME/tuxedo-qa}"
MCP_NAME="${TUXEDO_QA_NAME:-tuxedoqa}"

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
  case "$1" in
    claude) echo "claude mcp add $MCP_NAME --scope user -- node \"$DIST_ENTRY\"" ;;
    gemini) echo "gemini mcp add $MCP_NAME node \"$DIST_ENTRY\" --scope user" ;;
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

echo ""
ok "tuxedo-qa instalado em $INSTALL_DIR"
echo ""
echo "Próximos passos:"
echo "  1. Reinicie/reconecte sua CLI de IA pra carregar o servidor MCP novo."
echo "  2. (Opcional) inicie o dashboard de monitoramento:"
echo "       cd \"$INSTALL_DIR\" && npm run dashboard"
echo "  3. Peça ao seu agente pra criar o primeiro teste."
