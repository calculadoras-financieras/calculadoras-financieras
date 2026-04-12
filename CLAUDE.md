# CLAUDE.md — Instrucciones permanentes del proyecto

> Este archivo es leído automáticamente por Claude Code al inicio de cada sesión.

---

## ⚡ INICIO DE SESIÓN — LO PRIMERO QUE HACE CLAUDE

Al arrancar cualquier sesión nueva, Claude debe ejecutar esto antes de cualquier otra cosa:

```bash
# 1. Verificar si el PAT está disponible
if [ ! -f /root/.git-pat ]; then
  echo "⚠️  FALTA EL PAT. David debe ejecutar:"
  echo 'echo -n "ghp_TOKEN_AQUI" > /root/.git-pat && chmod 600 /root/.git-pat'
fi

# 2. Posicionarse en el repo y sincronizar
cd /home/user/calculadoras-financieras
PAT=$(cat /root/.git-pat 2>/dev/null)
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" 2>/dev/null
git checkout dev
git reset --hard origin/dev
```

Si `/root/.git-pat` no existe, pedirle el PAT a David antes de continuar.

---

## PUSH A GITHUB — REGLA CRÍTICA

**NUNCA usar `git push origin` — da 403. SIEMPRE usar URL completa con PAT.**

El proxy local de Claude Code (CCR) solo tiene permisos de lectura.
El PAT de GitHub es la única forma de escribir.

**El PAT NO persiste entre sesiones CCR.** Se guarda en `/root/.git-pat` al inicio de cada sesión.

### Push a dev (el más habitual):
```bash
PAT=$(cat /root/.git-pat)
git push "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD:dev
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" dev:refs/remotes/origin/dev
```

### Push a main (solo cuando David confirme):
```bash
PAT=$(cat /root/.git-pat)
git push "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD:main
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" main:refs/remotes/origin/main
```

### Push de rama claude/:
```bash
PAT=$(cat /root/.git-pat)
RAMA="claude/nombre-rama"
git push "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD:${RAMA}
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" ${RAMA}:refs/remotes/origin/${RAMA}
```

El `git fetch` después de cada push actualiza el tracking local y evita que
el stop-hook bloquee el cierre de sesión.

---

## VERIFICAR DEPLOY EN CLOUDFLARE PAGES

El push a `dev` dispara `deploy-dev.yml` automáticamente (~2-3 min).

- **Workflows:** `github.com/calculadoras-financieras/calculadoras-financieras/actions`
- **Hub:** https://calculadoras-financieras-dev.pages.dev
- **Hipoteca:** https://simular-hipoteca-dev.pages.dev
- **IRPF:** https://calculadora-irpf-dev.pages.dev
- **Finiquito:** https://calculadora-finiquito-dev.pages.dev
- **Pensión:** https://calculadora-pension-dev.pages.dev
- **Inversión:** https://calculadora-inversion-dev.pages.dev
- **Ahorro:** https://calculadora-ahorro-dev.pages.dev
- **Préstamo:** https://calculadora-prestamo-dev.pages.dev
- **Salario:** https://calculadora-salario-dev.pages.dev

Producción (solo tras confirmar dev): dominios propios vía `deploy.yml`.

---

## ESTRUCTURA DEL PROYECTO

- **Stack:** HTML/CSS/JS estático puro, tema oscuro `#1b2838`, sin build step
- **9 microsites** en `apps/` + hub en raíz del repo
- **Ramas:** `dev` (preview/testing) → `main` (producción, solo con OK de David)
- **Ramas de trabajo:** siempre con prefijo `claude/`
- **Hosting:** Cloudflare Pages (free tier), sin Netlify
- **Repo GitHub:** `calculadoras-financieras/calculadoras-financieras`

## REGLA DE MERGE

Nunca mergear ni pushear a `main` sin confirmación explícita de David.
Flujo siempre: rama `claude/` → `dev` (verificar) → `main`.
