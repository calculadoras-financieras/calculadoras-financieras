#!/usr/bin/env bash
# DEPLOY — Calculadoras Financieras España 2026
# Sube cada sitio a Netlify sin necesitar zip ni carpetas temporales
set -euo pipefail
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
CYN='\033[0;36m'; BLD='\033[1m'; NC='\033[0m'
ok()  { echo -e "${GRN}  ✓${NC} $1"; }
inf() { echo -e "${CYN}  →${NC} $1"; }
warn(){ echo -e "${YLW}  ⚠${NC} $1"; }
hdr() { echo -e "\n${BLD}${CYN}── $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
CREDS="$SCRIPT_DIR/.credentials"

# Suprimir warnings CRLF de git
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="core.autocrlf"
export GIT_CONFIG_VALUE_0="false"

if [ ! -f "$CREDS" ]; then
  echo -e "${YLW}Primera ejecución — introduce tus credenciales:${NC}"
  read -p "  GitHub username: " GH_USER
  read -p "  GitHub repo name: " GH_REPO
  read -s -p "  GitHub Token (ghp_...): " GH_TOKEN; echo
  read -s -p "  Netlify Token (nfp_...): " NF_TOKEN; echo
  printf 'GH_USER="%s"\nGH_REPO="%s"\nGH_TOKEN="%s"\nNF_TOKEN="%s"\n' \
    "$GH_USER" "$GH_REPO" "$GH_TOKEN" "$NF_TOKEN" > "$CREDS"
  chmod 600 "$CREDS"
  ok "Credenciales guardadas en scripts/.credentials"
fi
source "$CREDS"

NF_API="https://api.netlify.com/api/v1"

declare -A SITE_IDS=(
  ["prod"]="94958be5-4caf-4af3-b73f-68b93c7e9ceb"
  ["preview"]="e0d5dff7-efe8-471d-827e-fadbf5c4b7eb"
  ["simular-hipoteca"]="1c5ef26b-b294-4d98-9fa3-474745ad35f4"
  ["calculadora-irpf"]="102bf493-64f6-4b85-a8b2-578c8c514516"
  ["calculadora-finiquito"]="aa184e5c-4148-470e-933a-254582605411"
  ["calculadora-pension"]="f45c8975-1cb1-4a11-9308-3fed5089dc91"
  ["calculadora-inversion"]="e3075731-b098-45a8-bd4a-4d9e9ba02f78"
  ["calculadora-ahorro"]="5ab4395d-f3c7-492d-b9aa-053186a278a0"
  ["calculadora-prestamo"]="b00dc337-deb9-4d7b-9364-6a66b362d33a"
  ["calculadora-salario"]="f3ce86ac-2e26-4f26-92fd-e339b780bdfc"
)

declare -A SITE_DIRS=(
  ["prod"]="$ROOT"
  ["preview"]="$ROOT"
  ["simular-hipoteca"]="$ROOT/apps/simular-hipoteca"
  ["calculadora-irpf"]="$ROOT/apps/calculadora-irpf"
  ["calculadora-finiquito"]="$ROOT/apps/calculadora-finiquito"
  ["calculadora-pension"]="$ROOT/apps/calculadora-pension"
  ["calculadora-inversion"]="$ROOT/apps/calculadora-inversion"
  ["calculadora-ahorro"]="$ROOT/apps/calculadora-ahorro"
  ["calculadora-prestamo"]="$ROOT/apps/calculadora-prestamo"
  ["calculadora-salario"]="$ROOT/apps/calculadora-salario"
)

# Función: deploy de una carpeta via Netlify Files API (sin ZIP)
# Sube cada archivo individualmente con su hash SHA1
deploy_dir() {
  local SITE_ID="$1"
  local DIR="$2"
  local NAME="$3"

  # Recoger archivos relevantes
  local FILES=()
  while IFS= read -r -d '' f; do
    FILES+=("$f")
  done < <(find "$DIR" -type f \( -name "*.html" -o -name "*.xml" -o -name "*.txt" -o -name "*.toml" -o -name "*.js" -o -name "*.css" \) \
    ! -path "*/.git/*" ! -path "*/scripts/*" ! -path "*/__pycache__/*" \
    ! -name ".credentials" ! -name ".DS_Store" -print0)

  if [ ${#FILES[@]} -eq 0 ]; then
    warn "$NAME — no se encontraron archivos"
    return 1
  fi

  # Construir JSON con hashes SHA1 de cada archivo
  local FILES_JSON="{"
  local FIRST=1
  declare -A HASH_MAP

  for f in "${FILES[@]}"; do
    local REL_PATH="${f#$DIR}"
    # Normalizar separadores a /
    REL_PATH="${REL_PATH//\\//}"
    # Asegurar que empieza con /
    [[ "$REL_PATH" != /* ]] && REL_PATH="/$REL_PATH"

    local HASH
    HASH=$(sha1sum "$f" 2>/dev/null | cut -d' ' -f1)
    [ -z "$HASH" ] && continue

    HASH_MAP["$REL_PATH"]="$f"
    [ $FIRST -eq 0 ] && FILES_JSON+=","
    FILES_JSON+="\"$REL_PATH\":\"$HASH\""
    FIRST=0
  done
  FILES_JSON+="}"

  # Crear deploy con la lista de archivos
  local DEPLOY_RESP
  DEPLOY_RESP=$(curl -s -X POST "$NF_API/sites/$SITE_ID/deploys" \
    -H "Authorization: Bearer $NF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"files\":$FILES_JSON,\"async\":false}")

  local DEPLOY_ID
  DEPLOY_ID=$(echo "$DEPLOY_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -z "$DEPLOY_ID" ]; then
    local MSG
    MSG=$(echo "$DEPLOY_RESP" | grep -o '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
    warn "$NAME — error al crear deploy: ${MSG:-sin respuesta}"
    return 1
  fi

  # Subir archivos requeridos por Netlify
  local REQUIRED
  REQUIRED=$(echo "$DEPLOY_RESP" | grep -o '"required":\[[^]]*\]' | grep -o '"[a-f0-9]\{40\}"' | tr -d '"')

  if [ -n "$REQUIRED" ]; then
    local UPLOADED=0
    for HASH in $REQUIRED; do
      # Buscar qué archivo tiene este hash
      for REL_PATH in "${!HASH_MAP[@]}"; do
        local FPATH="${HASH_MAP[$REL_PATH]}"
        local FHASH
        FHASH=$(sha1sum "$FPATH" 2>/dev/null | cut -d' ' -f1)
        if [ "$FHASH" = "$HASH" ]; then
          curl -s -X PUT "$NF_API/deploys/$DEPLOY_ID/files$REL_PATH" \
            -H "Authorization: Bearer $NF_TOKEN" \
            -H "Content-Type: application/octet-stream" \
            --data-binary @"$FPATH" > /dev/null
          ((UPLOADED++))
          break
        fi
      done
    done
    inf "  Subidos $UPLOADED archivos"
  else
    inf "  Sin archivos nuevos (todo en caché)"
  fi

  # Obtener URL final
  local FINAL_URL
  FINAL_URL=$(curl -s "$NF_API/deploys/$DEPLOY_ID" \
    -H "Authorization: Bearer $NF_TOKEN" | \
    grep -o '"deploy_ssl_url":"[^"]*"' | head -1 | cut -d'"' -f4)

  ok "$NAME${FINAL_URL:+  →  $FINAL_URL}"
  return 0
}

echo ""
echo -e "${BLD}╔══════════════════════════════════════════════════════╗"
echo -e "║   🚀 DEPLOY — Calculadoras Financieras España        ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"

hdr "1/3  Verificando herramientas"
for cmd in git curl sha1sum; do
  command -v $cmd &>/dev/null && ok "$cmd" || { echo -e "${RED}  ✗ Falta '$cmd'${NC}"; exit 1; }
done

hdr "2/3  GitHub"
cd "$ROOT"
git config core.autocrlf false 2>/dev/null || true

HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$GH_USER/$GH_REPO")
[ "$HTTP" = "200" ] && ok "Repositorio $GH_USER/$GH_REPO" || warn "Repo no verificado"

printf 'scripts/.credentials\n.DS_Store\n*.log\n__pycache__/\n' > .gitignore

[ ! -d ".git" ] && git init -q && git branch -M main 2>/dev/null || true
git config core.autocrlf false
git add -A
git diff --cached --quiet \
  && git commit --allow-empty -m "Deploy $(date '+%Y-%m-%d %H:%M')" -q \
  || git commit -m "Deploy $(date '+%Y-%m-%d %H:%M')" -q 2>/dev/null
git remote remove origin 2>/dev/null || true
git remote add origin "https://$GH_TOKEN@github.com/$GH_USER/$GH_REPO.git"
inf "Subiendo a GitHub..."
git push -u origin main --force -q 2>/dev/null \
  && ok "https://github.com/$GH_USER/$GH_REPO" \
  || warn "Push GitHub falló"

hdr "3/3  Netlify — desplegando 10 sitios (sin ZIP)"
OK=0; FAIL=0

for NAME in prod preview simular-hipoteca calculadora-irpf calculadora-finiquito \
            calculadora-pension calculadora-inversion calculadora-ahorro \
            calculadora-prestamo calculadora-salario; do

  SITE_ID="${SITE_IDS[$NAME]}"
  DIR="${SITE_DIRS[$NAME]}"

  if [ ! -d "$DIR" ]; then
    warn "$NAME — carpeta no encontrada: $DIR"
    ((FAIL++)); continue
  fi

  inf "Desplegando: $NAME"
  if deploy_dir "$SITE_ID" "$DIR" "$NAME"; then
    ((OK++))
  else
    ((FAIL++))
  fi
done

echo ""
echo -e "${BLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GRN}${BLD}✓ Desplegados: $OK / $((OK+FAIL))${NC}"
[ $FAIL -gt 0 ] && echo -e "  ${YLW}⚠ Con aviso: $FAIL${NC}"
echo ""
[ $FAIL -eq 0 ] \
  && echo -e "${GRN}${BLD}  ✅ DEPLOY COMPLETADO — 10/10${NC}" \
  || echo -e "${YLW}${BLD}  ⚠ $OK/10 desplegados${NC}"
echo ""
