#!/bin/bash
# ============================================================
# setup-local.sh — Configuración inicial del proyecto en tu PC
# Ejecutar UNA SOLA VEZ después de clonar el repo
# ============================================================
set -e

REPO_URL="https://github.com/calculadoras-financieras/calculadoras-financieras.git"
LOCAL_DIR="$HOME/calculadoras-financieras"

echo ""
echo "======================================================="
echo "  Setup local — Calculadoras Financieras"
echo "======================================================="
echo ""

# --- 1. Clonar o actualizar ---
if [ -d "$LOCAL_DIR/.git" ]; then
  echo "✓ Repo ya existe en $LOCAL_DIR — actualizando..."
  cd "$LOCAL_DIR"
  git fetch origin
  git checkout dev
  git reset --hard origin/dev
else
  echo "→ Clonando repo en $LOCAL_DIR..."
  git clone "$REPO_URL" "$LOCAL_DIR"
  cd "$LOCAL_DIR"
  git checkout dev
fi

echo "✓ Repo listo en $LOCAL_DIR"
echo ""

# --- 2. Guardar el PAT para uso local permanente ---
PAT_FILE="$HOME/.config/calculadoras-pat"
mkdir -p "$HOME/.config"

if [ -f "$PAT_FILE" ]; then
  echo "✓ PAT ya guardado en $PAT_FILE"
else
  echo "Necesito el GitHub PAT (empieza por ghp_...):"
  read -r -s PAT_INPUT
  echo -n "$PAT_INPUT" > "$PAT_FILE"
  chmod 600 "$PAT_FILE"
  echo "✓ PAT guardado en $PAT_FILE (solo tú puedes leerlo)"
fi

PAT=$(cat "$PAT_FILE")

# --- 3. Configurar git credential store con el PAT ---
git config --global credential.helper store
# Escribir la credencial en el store
python3 -c "
import os, subprocess
pat = open(os.path.expanduser('~/.config/calculadoras-pat')).read().strip()
line = f'https://{pat}@github.com\n'
creds_file = os.path.expanduser('~/.git-credentials')
existing = open(creds_file).read() if os.path.exists(creds_file) else ''
if 'github.com' not in existing:
    with open(creds_file, 'a') as f:
        f.write(line)
    os.chmod(creds_file, 0o600)
    print('✓ Credencial git guardada en ~/.git-credentials')
else:
    print('✓ Credencial git ya existe en ~/.git-credentials')
" 2>/dev/null || {
  CREDS="$HOME/.git-credentials"
  if ! grep -q "github.com" "$CREDS" 2>/dev/null; then
    echo "https://${PAT}@github.com" >> "$CREDS"
    chmod 600 "$CREDS"
    echo "✓ Credencial git guardada"
  else
    echo "✓ Credencial git ya existe"
  fi
}

# --- 4. Identidad git ---
git config --global user.email "claude@anthropic.com"
git config --global user.name "Claude"
echo "✓ Identidad git configurada"
echo ""

# --- 5. Verificar que el push funciona ---
echo "→ Verificando acceso de escritura a GitHub..."
if git ls-remote "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD &>/dev/null; then
  echo "✓ Acceso a GitHub confirmado"
else
  echo "✗ Error: no se puede acceder a GitHub. Verifica el PAT."
  exit 1
fi

echo ""
echo "======================================================="
echo "  ✅ Setup completado"
echo "======================================================="
echo ""
echo "  Repo local: $LOCAL_DIR"
echo "  PAT guardado: $PAT_FILE"
echo ""
echo "  Para usar Claude Code localmente:"
echo "    cd $LOCAL_DIR && claude"
echo ""
echo "  Para actualizar el repo manualmente:"
echo "    cd $LOCAL_DIR && git pull"
echo ""
echo "  Para pushear (desde tu PC, sin necesitar PAT cada vez):"
echo "    git push origin HEAD:dev"
echo ""
