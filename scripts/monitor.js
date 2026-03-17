#!/usr/bin/env node
/**
 * monitor.js v2 — CalculadorasFinancieras.es
 * Timeout 30s, 2 reintentos, URLs hardcodeadas como fallback.
 */

const { sendAlert, sendRecovery, escapeHtml, timestamp } = require('./notify-telegram');
const fs   = require('fs');
const path = require('path');

const SITES = [
  { id:'hub',       name:'Hub Principal',        url: process.env.URL_HUB       || 'https://calculadoras-financieras.es',  checks:[{type:'status',expected:200},{type:'content',contains:'calculadora'}] },
  { id:'hipoteca',  name:'Simulador Hipoteca',    url: process.env.URL_HIPOTECA  || 'https://simular-hipoteca.es',          checks:[{type:'status',expected:200},{type:'content',contains:'hipoteca'}] },
  { id:'irpf',      name:'Calculadora IRPF',      url: process.env.URL_IRPF      || 'https://calculadora-irpf.es',          checks:[{type:'status',expected:200},{type:'content',contains:'IRPF'}] },
  { id:'finiquito', name:'Calculadora Finiquito',  url: process.env.URL_FINIQUITO || 'https://calculadora-finiquito.es',    checks:[{type:'status',expected:200},{type:'content',contains:'finiquito'}] },
  { id:'pension',   name:'Calculadora Pension',   url: process.env.URL_PENSION   || 'https://calculadora-pension.es',      checks:[{type:'status',expected:200},{type:'content',contains:'pensi'}] },
  { id:'inversion', name:'Calculadora Inversion', url: process.env.URL_INVERSION || 'https://calculadora-inversion.es',   checks:[{type:'status',expected:200},{type:'content',contains:'inversi'}] },
  { id:'ahorro',    name:'Calculadora Ahorro',    url: process.env.URL_AHORRO    || 'https://calculadora-ahorro.es',       checks:[{type:'status',expected:200},{type:'content',contains:'ahorro'}] },
  { id:'prestamo',  name:'Calculadora Prestamo',  url: process.env.URL_PRESTAMO  || 'https://calculadora-prestamo.es',    checks:[{type:'status',expected:200},{type:'content',contains:'pr'}] },
  { id:'salario',   name:'Calculadora Salario',   url: process.env.URL_SALARIO   || 'https://calculadora-salario.com',    checks:[{type:'status',expected:200},{type:'content',contains:'salario'}] },
];

const STATE_FILE = path.join(process.env.RUNNER_TEMP || '/tmp', 'monitor-state.json');
const TIMEOUT    = 30000;
const MAX_RETRIES = 2;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch(_) { return {}; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch(_) {}
}

async function fetchWithRetry(url, retries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CalculadorasFinancieras-Monitor/2.0' },
        redirect: 'follow',
      });
      clearTimeout(timer);
      const html = await r.text();
      return { ok: true, status: r.status, html };
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) return { ok: false, error: err.message };
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

async function checkSite(site) {
  const result = { id: site.id, name: site.name, url: site.url, ok: true, errors: [] };
  const resp = await fetchWithRetry(site.url, MAX_RETRIES);
  if (!resp.ok) {
    result.ok = false;
    result.errors.push('Timeout/error (' + MAX_RETRIES + ' intentos): ' + resp.error);
    return result;
  }
  if (resp.status !== 200) {
    result.ok = false;
    result.errors.push('HTTP ' + resp.status + ' (esperado 200)');
  }
  const lower = resp.html.toLowerCase();
  for (const check of site.checks) {
    if (check.type === 'content' && !lower.includes(check.contains.toLowerCase())) {
      result.errors.push('Contenido no encontrado: "' + check.contains + '"');
    }
  }
  return result;
}

async function main() {
  const state = loadState();
  const results = await Promise.allSettled(SITES.map(s => checkSite(s)));
  const checks  = results.map(r => r.status === 'fulfilled' ? r.value : { ok:false, id:'unknown', name:'unknown', url:'', errors:[String(r.reason)] });

  const failed    = checks.filter(c => !c.ok);
  const recovered = checks.filter(c => c.ok && state[c.id] === 'down');

  for (const c of checks) state[c.id] = c.ok ? 'up' : 'down';
  saveState(state);

  for (const c of recovered) {
    await sendRecovery(c.name, 'El sitio ' + c.url + ' ha vuelto a funcionar.');
  }

  if (failed.length === 0) {
    console.log('OK todos los sitios UP - ' + timestamp());
    return;
  }

  const lines = failed.map(c => '• <b>' + escapeHtml(c.name) + '</b>\n  ' + escapeHtml(c.errors.join(', '))).join('\n');
  const urls  = failed.map(c => '• ' + c.url).join('\n');
  await sendAlert('Monitor de micrositios',
    'Los siguientes sitios han fallado:\n\n' + lines + '\n\nURL afectadas:\n' + urls
  );
  console.log('ALERTA: ' + failed.length + ' sitios con problemas');
}

main().catch(async err => {
  console.error('Error en monitor:', err);
  process.exit(1);
});
