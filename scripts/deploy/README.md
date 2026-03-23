# Scripts de Deploy — Calculadoras Financieras España

## Uso rápido

```bash
# Primera vez: pedirá los tokens interactivamente
node scripts/deploy/deploy.js

# Solo dev
node scripts/deploy/deploy.js --dev

# Solo producción (después de verificar dev)
node scripts/deploy/deploy.js --prod

# Dev + Prod + verificación automática (recomendado)
node scripts/deploy/deploy.js

# Solo verificar que todo responde HTTP 200
node scripts/deploy/deploy.js --verify

# Forzar prod aunque dev falle
node scripts/deploy/deploy.js --force

# Sin push a GitHub
node scripts/deploy/deploy.js --no-git
```

## Configuración de tokens (.tokens)

La primera vez que ejecutes el script, te pedirá:
- **GitHub Token**: Ve a github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token. Permisos necesarios: `repo` (todo) + `workflow`.
- **Cloudflare API Token**: Ve a dash.cloudflare.com → My Profile → API Tokens → Create Token → Edit Cloudflare Workers.
- **Cloudflare Account ID**: `9e49f81cdf5ef61300561dda2f2336dd`

Los tokens se guardan en `.tokens` (en la raíz del repo, **nunca versionado**).

## ¿Qué hace el script?

1. Lee tokens de `.tokens` (o los pide si no existen)
2. Verifica que `wrangler` está instalado (lo instala si no)
3. Despliega cada app a su proyecto de CF Pages (`--dev` o `--prod`)
4. En modo completo, verifica dev antes de ir a prod
5. Hace push a GitHub (rama `dev` o `main` según el modo)
6. Guarda un log en `scripts/deploy/logs/`

## Flujo recomendado

```
node scripts/deploy/deploy.js --dev    # Despliega a *.pages.dev
# Abre un site dev en el navegador y verifica
node scripts/deploy/deploy.js --prod   # Despliega a los dominios reales
```

## Rollback manual

Si algo sale mal en producción:
1. Ve a dash.cloudflare.com → Pages → [nombre del proyecto]
2. Click en "Deployments"
3. Busca el deploy anterior (tiene timestamp)
4. Click en los tres puntos → "Rollback to this deployment"

Esto restaura el site en segundos sin necesidad de redeploy.
