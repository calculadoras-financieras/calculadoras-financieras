#!/usr/bin/env node
/**
 * deploy.js — Calculadoras Financieras España
 *
 * Despliega todos los sites a Cloudflare Pages y hace push a GitHub.
 * Lee tokens del archivo .tokens (nunca versionado).
 *
 * Uso:
 *   node scripts/deploy/deploy.js           → despliega todo (dev + prod)
 *   node scripts/deploy/deploy.js --prod    → solo producción
 *   node scripts/deploy/deploy.js --dev     → solo entornos dev
 *   node scripts/deploy/deploy.js --verify  → solo verificar URLs
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ── Colores de terminal ────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};
const ok   = (m) => console.log(`${C.green}  ✓${C.reset} ${m}`);
const err  = (m) => console.log(`${C.red}  ✗${C.reset} ${m}`);
const info = (m) => console.log(`${C.cyan}  →${C.reset} ${m}`);
const warn = (m) => console.log(`${C.yellow}  ⚠${C.reset} ${m}`);
const hdr  = (m) => console.log(`\n${C.bold}${C.cyan}── ${m}${C.reset}`);

// ── Leer tokens ────────────────────────────────────────────────────────────
const ROOT        = path.join(__dirname, '..', '..');
const TOKENS_FILE = path.join(ROOT, '.tokens');

function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) {
    console.log(`\n${C.yellow}Primera ejecución — introduce tus tokens:${C.reset}`);
    console.log(`${C.gray}(Se guardarán en .tokens, que está en .gitignore)${C.reset}\n`);

    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(r => rl.question(q, r));

    return (async () => {
      const ghToken = (await ask('  GitHub Token (ghp_...): ')).trim();
      const cfToken = (await ask('  Cloudflare API Token:   ')).trim();
      const cfAccount = (await ask('  Cloudflare Account ID:  ')).trim();
      rl.close();

      const content = `GH_TOKEN=${ghToken}\nCF_TOKEN=${cfToken}\nCF_ACCOUNT=${cfAccount}\n`;
      fs.writeFileSync(TOKENS_FILE, content, { mode: 0o600 });
      ok(`.tokens guardado (permisos 600)`);
      return parseTokens(content);
    })();
  }

  return Promise.resolve(parseTokens(fs.readFileSync(TOKENS_FILE, 'utf8')));
}

function parseTokens(content) {
  const tokens = {};
  for (const line of content.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length) tokens[k.trim()] = v.join('=').trim();
  }
  return tokens;
}

// ── Configuración de proyectos ─────────────────────────────────────────────
const PROJECTS = [
  { name: 'calculadoras-financieras',  dir: '.',                          domain: 'calculadoras-financieras.es',  devProject: 'calculadoras-financieras-dev'  },
  { name: 'simular-hipoteca',          dir: 'apps/simular-hipoteca',       domain: 'simular-hipoteca.es',           devProject: 'simular-hipoteca-dev'           },
  { name: 'calculadora-irpf',          dir: 'apps/calculadora-irpf',       domain: 'calculadora-irpf.es',           devProject: 'calculadora-irpf-dev'           },
  { name: 'calculadora-finiquito',     dir: 'apps/calculadora-finiquito',   domain: 'calculadora-finiquito.es',      devProject: 'calculadora-finiquito-dev'      },
  { name: 'calculadora-pension',       dir: 'apps/calculadora-pension',     domain: 'calculadora-pension.es',        devProject: 'calculadora-pension-dev'        },
  { name: 'calculadora-inversion',     dir: 'apps/calculadora-inversion',   domain: 'calculadora-inversion.es',      devProject: 'calculadora-inversion-dev'      },
  { name: 'calculadora-ahorro',        dir: 'apps/calculadora-ahorro',      domain: 'calculadora-ahorro.es',         devProject: 'calculadora-ahorro-dev'         },
  { name: 'calculadora-prestamo',      dir: 'apps/calculadora-prestamo',    domain: 'calculadora-prestamo.es',       devProject: 'calculadora-prestamo-dev'       },
  { name: 'calculadora-salario',       dir: 'apps/calculadora-salario',     domain: 'calculadora-salario.com',       devProject: 'calculadora-salario-dev'        },
];

// ── Llamadas a la API de Cloudflare ────────────────────────────────────────
async function cfRequest(method, endpoint, body, cfToken) {
  const url = `https://api.cloudflare.com/client/v4${endpoint}`;
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  return res.json();
}

async function ensureProjectExists(projectName, cfToken, cfAccount) {
  // Comprueba si el proyecto existe
  const list = await cfRequest('GET', `/accounts/${cfAccount}/pages/projects`, null, cfToken);
  if (!list.success) throw new Error(`CF API error: ${JSON.stringify(list.errors)}`);

  const exists = list.result.some(p => p.name === projectName);
  if (exists) return true;

  // Crear proyecto si no existe
  const create = await cfRequest('POST', `/accounts/${cfAccount}/pages/projects`, {
    name: projectName,
    production_branch: 'main',
  }, cfToken);

  if (!create.success) throw new Error(`Error creando proyecto ${projectName}: ${JSON.stringify(create.errors)}`);
  ok(`Proyecto CF creado: ${projectName}`);
  return true;
}

// ── Deploy con Wrangler ────────────────────────────────────────────────────
function deployWithWrangler(projectName, dirPath, cfToken, cfAccount, branch) {
  const absDir = path.join(ROOT, dirPath);
  if (!fs.existsSync(absDir)) {
    err(`Directorio no encontrado: ${dirPath}`);
    return false;
  }

  const env = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: cfToken,
    CLOUDFLARE_ACCOUNT_ID: cfAccount,
  };

  const result = spawnSync('npx', [
    'wrangler', 'pages', 'deploy', absDir,
    '--project-name', projectName,
    '--branch', branch,
    '--commit-dirty=true',
  ], { env, encoding: 'utf8', timeout: 120000 });

  if (result.status !== 0) {
    err(`wrangler falló para ${projectName}:`);
    console.log(result.stderr || result.stdout || '(sin output)');
    return false;
  }

  // Extraer URL del output
  const output = result.stdout + result.stderr;
  const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.pages\.dev/);
  const deployUrl = urlMatch ? urlMatch[0] : `https://${projectName}.pages.dev`;
  ok(`${projectName} → ${deployUrl}`);
  return true;
}

// ── Verificar URLs ─────────────────────────────────────────────────────────
async function verifyUrl(url, label) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      ok(`${res.status}  ${label}`);
      return true;
    } else {
      err(`${res.status}  ${label}`);
      return false;
    }
  } catch (e) {
    err(`ERR   ${label} — ${e.message}`);
    return false;
  }
}

async function verifyAll(projects, mode) {
  hdr('Verificando URLs');
  const checks = [];

  for (const p of projects) {
    if (mode === 'dev' || mode === 'both') {
      checks.push(verifyUrl(`https://${p.devProject}.pages.dev`, `[dev] ${p.devProject}`));
    }
    if (mode === 'prod' || mode === 'both') {
      checks.push(verifyUrl(`https://${p.domain}`, `[prod] ${p.domain}`));
    }
  }

  const results = await Promise.all(checks);
  const passed = results.filter(Boolean).length;
  console.log(`\n  ${passed}/${results.length} URLs responden correctamente`);
  return passed === results.length;
}

// ── GitHub push ────────────────────────────────────────────────────────────
function pushToGitHub(ghToken, branch) {
  hdr('GitHub');

  // Configurar remote con token
  const repoUrl = `https://${ghToken}@github.com/calculadoras-financieras/calculadoras-financieras.git`;

  try {
    execSync(`git remote set-url origin "${repoUrl}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync(`git push -u origin HEAD:${branch} --force`, { cwd: ROOT, stdio: 'pipe' });
    ok(`Pushed a origin/${branch}`);
    // Restaurar URL sin token en los logs
    execSync('git remote set-url origin https://github.com/calculadoras-financieras/calculadoras-financieras.git', { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch (e) {
    err(`Push GitHub falló: ${e.message}`);
    return false;
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const onlyProd   = args.includes('--prod');
  const onlyDev    = args.includes('--dev');
  const onlyVerify = args.includes('--verify');
  const skipGit    = args.includes('--no-git');

  const mode = onlyProd ? 'prod' : onlyDev ? 'dev' : 'both';

  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗`);
  console.log(`║   🚀  DEPLOY — Calculadoras Financieras España       ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Modo: ${C.bold}${mode}${C.reset}  ${new Date().toLocaleString('es-ES')}\n`);

  const tokens = await loadTokens();
  const { GH_TOKEN, CF_TOKEN, CF_ACCOUNT } = tokens;

  if (!CF_TOKEN || !CF_ACCOUNT) {
    err('Faltan CF_TOKEN o CF_ACCOUNT en .tokens');
    process.exit(1);
  }

  // Solo verificar
  if (onlyVerify) {
    await verifyAll(PROJECTS, mode === 'both' ? 'prod' : mode);
    return;
  }

  // ── Wrangler disponible? ────────────────────────────────────────────────
  hdr('Verificando herramientas');
  const wranglerCheck = spawnSync('npx', ['wrangler', '--version'], { encoding: 'utf8' });
  if (wranglerCheck.status !== 0) {
    warn('wrangler no encontrado, instalando...');
    execSync('npm install -g wrangler', { stdio: 'inherit' });
  } else {
    ok(`wrangler ${wranglerCheck.stdout.trim()}`);
  }

  // ── Pre-deploy: verificar git limpio ───────────────────────────────────
  hdr('Git status');
  const gitStatus = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (gitStatus) {
    warn('Hay cambios sin commitear. Se incluirán en el deploy con --commit-dirty');
  } else {
    ok('Working tree limpio');
  }

  // ── Deploy a dev ────────────────────────────────────────────────────────
  let devOk = 0, devFail = 0;
  if (mode === 'dev' || mode === 'both') {
    hdr(`Deploy DEV (${PROJECTS.length} proyectos)`);
    for (const p of PROJECTS) {
      info(`${p.devProject}...`);
      await ensureProjectExists(p.devProject, CF_TOKEN, CF_ACCOUNT);
      const success = deployWithWrangler(p.devProject, p.dir, CF_TOKEN, CF_ACCOUNT, 'dev');
      success ? devOk++ : devFail++;
    }
    console.log(`\n  Dev: ${C.green}${devOk} OK${C.reset}${devFail ? `, ${C.red}${devFail} errores${C.reset}` : ''}`);
  }

  // ── Verificar dev antes de ir a prod ───────────────────────────────────
  if (mode === 'both' && devOk > 0) {
    info('Esperando 10s para que CF Pages propague...');
    await new Promise(r => setTimeout(r, 10000));
    const devOkAll = await verifyAll(PROJECTS, 'dev');
    if (!devOkAll) {
      warn('Algunos sites dev no responden correctamente.');
      warn('Revisa los errores antes de continuar a producción.');
      if (!args.includes('--force')) {
        err('Deploy a producción cancelado. Usa --force para ignorar.');
        process.exit(1);
      }
    }
  }

  // ── Deploy a producción ─────────────────────────────────────────────────
  let prodOk = 0, prodFail = 0;
  if (mode === 'prod' || mode === 'both') {
    hdr(`Deploy PRODUCCIÓN (${PROJECTS.length} proyectos)`);
    for (const p of PROJECTS) {
      info(`${p.name}...`);
      await ensureProjectExists(p.name, CF_TOKEN, CF_ACCOUNT);
      const success = deployWithWrangler(p.name, p.dir, CF_TOKEN, CF_ACCOUNT, 'main');
      success ? prodOk++ : prodFail++;
    }
    console.log(`\n  Prod: ${C.green}${prodOk} OK${C.reset}${prodFail ? `, ${C.red}${prodFail} errores${C.reset}` : ''}`);
  }

  // ── Push a GitHub ───────────────────────────────────────────────────────
  if (!skipGit && GH_TOKEN) {
    const branch = mode === 'dev' ? 'dev' : 'main';
    pushToGitHub(GH_TOKEN, branch);
  } else if (!GH_TOKEN) {
    warn('GH_TOKEN no configurado — no se hizo push a GitHub');
  }

  // ── Resumen final ───────────────────────────────────────────────────────
  const total = devOk + prodOk;
  const totalFail = devFail + prodFail;
  console.log(`\n${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
  if (totalFail === 0) {
    console.log(`  ${C.green}${C.bold}✅ DEPLOY COMPLETADO — ${total}/${PROJECTS.length * (mode === 'both' ? 2 : 1)} sitios${C.reset}`);
  } else {
    console.log(`  ${C.yellow}${C.bold}⚠  ${total} OK, ${totalFail} con errores${C.reset}`);
  }
  console.log('');

  // Log del deploy
  const logDir = path.join(ROOT, 'scripts', 'deploy', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `deploy-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const logContent = `Deploy ${new Date().toISOString()}\nModo: ${mode}\nDev OK: ${devOk}/${PROJECTS.length}\nProd OK: ${prodOk}/${PROJECTS.length}\n`;
  fs.writeFileSync(logFile, logContent);
}

main().catch(e => {
  console.error(`\n${C.red}Error fatal:${C.reset}`, e.message);
  process.exit(1);
});
