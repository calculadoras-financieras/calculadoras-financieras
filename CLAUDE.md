# CLAUDE.md — Instrucciones permanentes del proyecto

## PUSH A GITHUB — REGLA CRÍTICA

**NUNCA usar `git push origin` ni `git push` a secas — da 403.**
**SIEMPRE usar la URL completa con el PAT embebido.**

El PAT (token GitHub Personal Access Token con scope `repo`) se guarda en
`/root/.git-pat` — nunca lo pongas en texto en archivos del repo.

```bash
PAT=$(cat /root/.git-pat)
REPO="https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git"
```

### Push a dev (el más habitual):
```bash
PAT=$(cat /root/.git-pat)
git push "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD:dev
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" dev:refs/remotes/origin/dev
```

### Push a main (solo cuando David lo confirme):
```bash
PAT=$(cat /root/.git-pat)
git push "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD:main
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" main:refs/remotes/origin/main
```

### Push de rama de trabajo claude/:
```bash
PAT=$(cat /root/.git-pat)
git push "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD:claude/nombre-rama
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" claude/nombre-rama:refs/remotes/origin/claude/nombre-rama
```

El `git fetch` después de cada push actualiza el tracking local y evita que
el stop-hook se queje de commits "sin publicar".

---

## SECUENCIA COMPLETA DE TRABAJO (inicio de sesión)

```bash
cd /home/user/calculadoras-financieras
PAT=$(cat /root/.git-pat)
git config user.email "claude@anthropic.com"
git config user.name "Claude"
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git"
git checkout dev
git reset --hard origin/dev
# ... hacer cambios ...
git add -A
git commit -m "descripción del cambio"
git push "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" HEAD:dev
git fetch "https://${PAT}@github.com/calculadoras-financieras/calculadoras-financieras.git" dev:refs/remotes/origin/dev
```

---

## VERIFICAR DEPLOY EN CLOUDFLARE PAGES (rama dev)

El push a `dev` dispara el workflow `deploy-dev.yml` automáticamente vía GitHub Actions.

### Dónde comprobar:
1. **Estado del workflow:** `github.com/calculadoras-financieras/calculadoras-financieras/actions`
2. **URLs de preview dev** (disponibles ~2-3 min después del push):

| Microsite | URL dev |
|-----------|---------|
| Hub principal | https://calculadoras-financieras-dev.pages.dev |
| Hipoteca | https://simular-hipoteca-dev.pages.dev |
| IRPF | https://calculadora-irpf-dev.pages.dev |
| Finiquito | https://calculadora-finiquito-dev.pages.dev |
| Pensión | https://calculadora-pension-dev.pages.dev |
| Inversión | https://calculadora-inversion-dev.pages.dev |
| Ahorro | https://calculadora-ahorro-dev.pages.dev |
| Préstamo | https://calculadora-prestamo-dev.pages.dev |
| Salario | https://calculadora-salario-dev.pages.dev |

### Flujo completo:
- `dev` push → GitHub Actions `deploy-dev.yml` → Cloudflare Pages → URLs `*-dev.pages.dev`
- `main` push → GitHub Actions `deploy.yml` → Cloudflare Pages → URLs de producción (dominios propios)

---

## ESTRUCTURA DEL PROYECTO

- **Stack:** 100% HTML/CSS/JS estático, tema oscuro `#1b2838`, sin build step
- **9 microsites** en `apps/` + hub en raíz
- **Ramas:** `dev` (preview/testing) → `main` (producción)
- **Ramas de trabajo:** prefijo `claude/` (ej. `claude/financial-calculator-suite-Nt2yL`)
- **Hosting:** Cloudflare Pages (free tier), sin Netlify

## REGLA DE MERGE

Nunca mergear directamente a `main` sin que David confirme que el deploy de `dev` está correcto.
