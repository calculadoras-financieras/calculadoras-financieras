#!/usr/bin/env node
/**
 * monitor.js
 * Sistema de monitorización automática con transacciones sintéticas.
 * Verifica que cada micrositio carga, responde y tiene contenido válido.
 *
 * Se ejecuta cada 15 minutos vía GitHub Actions.
 * En caso de fallo envía alerta por Telegram.
 * En caso de recuperación envía notificación verde.
 *
 * Usa un fichero de estado persistente en GitHub Actions cache
 * para evitar alertas duplicadas (solo alerta en el primer fallo).
 */

const { sendAlert, sendRecovery, escapeHtml, timestamp } = require('./notify-telegram');
const fs = require('fs');
const path = require('path');

// ─── Configuración de sitios ───────────────────────────────────────────────
const SITES = [
  {
    id:   'hub',
    name: 'Hub Principal',
    url:  process.env.URL_HUB || 'https://calculadoras-financieras.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'Calculadoras Financieras' },
      { type: 'content', contains: 'hipoteca' },
    ],
  },
  {
    id:   'hipoteca',
    name: 'Simulador Hipoteca',
    url:  process.env.URL_HIPOTECA || 'https://simular-hipoteca.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'hipoteca' },
    ],
    synthetic: {
      description: 'Calcular cuota hipoteca 200.000€ a 25 años',
      steps: [
        'Verificar que el formulario de hipoteca existe',
        'Verificar campo capital present',
        'Verificar campo años present',
        'Verificar campo tipo interés present',
        'Verificar botón calcular present',
      ],
      selectors: ['#capital', '#anios', '#interes', 'button[onclick]'],
    },
  },
  {
    id:   'irpf',
    name: 'Calculadora IRPF',
    url:  process.env.URL_IRPF || 'https://calculadora-irpf.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'IRPF' },
    ],
  },
  {
    id:   'finiquito',
    name: 'Calculadora Finiquito',
    url:  process.env.URL_FINIQUITO || 'https://calculadora-finiquito.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'finiquito' },
    ],
  },
  {
    id:   'pension',
    name: 'Calculadora Pensión',
    url:  process.env.URL_PENSION || 'https://calculadora-pension.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'pensión' },
    ],
  },
  {
    id:   'inversion',
    name: 'Calculadora Inversión',
    url:  process.env.URL_INVERSION || 'https://calculadora-inversion.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'inversión' },
    ],
  },
  {
    id:   'ahorro',
    name: 'Calculadora Ahorro',
    url:  process.env.URL_AHORRO || 'https://calculadora-ahorro.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'ahorro' },
    ],
  },
  {
    id:   'prestamo',
    name: 'Calculadora Préstamo',
    url:  process.env.URL_PRESTAMO || 'https://calculadora-prestamo.es',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'préstamo' },
    ],
  },
  {
    id:   'salario',
    name: 'Calculadora Salario',
    url:  process.env.URL_SALARIO || 'https://calculadora-salario.com',
    checks: [
      { type: 'status',  expected: 200 },
      { type: 'content', contains: 'salario' },
    ],
  },
];

// ─── Estado persistente ────────────────────────────────────────────────────
const STATE_FILE = path.join(process.env.RUNNER_TEMP || '/tmp', 'monitor-state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (_) {}
}

// ─── Verificación de un sitio ──────────────────────────────────────────────
async function checkSite(site) {
  const result = { id: site.id, name: site.name, url: site.url, ok: true, errors: [] };
  const TIMEOUT = 10_000; // 10s

  let html = '';
  let statusCode = 0;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    const resp = await fetch(site.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CalculadorasFinancieras-Monitor/1.0' },
      redirect: 'follow',
    });

    clearTimeout(timer);
    statusCode = resp.status;
    html = await resp.text();

  } catch (err) {
    result.ok = false;
    result.errors.push(`Timeout o error de red: ${err.message}`);
    return result;
  }

  // Ejecutar checks declarativos
  for (const check of site.checks) {
    if (check.type === 'status') {
      if (statusCode !== check.expected) {
        result.ok = false;
        result.errors.push(`HTTP ${statusCode} (esperado ${check.expected})`);
      }
    } else if (check.type === 'content') {
      const lower = html.toLowerCase();
      if (!lower.includes(check.contains.toLowerCase())) {
        result.ok = false;
        result.errors.push(`Contenido no encontrado: "${check.contains}"`);
      }
    }
  }

  // Transacciones sintéticas: verificar selectores del DOM
  if (site.synthetic && html) {
    const selectors = site.synthetic.selectors || [];
    for (const sel of selectors) {
      // Búsqueda simplificada por id/type en el HTML crudo
      const idMatch = sel.match(/^#(.+)$/);
      if (idMatch) {
        const id = idMatch[1];
        if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
          result.errors.push(`⚗️ Sintético: elemento #${id} no encontrado`);
          // No bloquea el check principal — es warning
        }
      }
    }
  }

  result.statusCode = statusCode;
  result.responseSize = html.length;
  return result;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 Monitor iniciado — ${timestamp()}\n`);

  const state = loadState();
  const results = await Promise.all(SITES.map(checkSite));

  let hasNewFailures  = false;
  let hasRecoveries   = false;
  const failedSites   = [];
  const recoveredSites = [];

  for (const r of results) {
    const wasDown = state[r.id]?.down === true;

    if (!r.ok) {
      console.log(`❌ ${r.name}: ${r.errors.join(' | ')}`);
      failedSites.push(r);

      if (!wasDown) {
        // Primer fallo — alerta
        hasNewFailures = true;
        state[r.id] = { down: true, since: new Date().toISOString(), errors: r.errors };
      }
    } else {
      console.log(`✅ ${r.name}: OK (${r.statusCode}, ${Math.round((r.responseSize||0)/1024)}KB)`);

      if (wasDown) {
        // Recuperación
        hasRecoveries = true;
        recoveredSites.push(r);
        delete state[r.id];
      } else {
        state[r.id] = { down: false };
      }
    }
  }

  saveState(state);

  // Enviar alerta por Telegram si hay nuevos fallos
  if (hasNewFailures) {
    const lines = failedSites
      .filter(r => !state[r.id]?.alertedAt) // solo nuevos
      .map(r => `• <b>${escapeHtml(r.name)}</b>\n  ${r.errors.map(e => escapeHtml(e)).join('\n  ')}`);

    if (lines.length > 0) {
      await sendAlert(
        'Micrositio(s) caído(s)',
        `Los siguientes sitios han fallado:\n\n${lines.join('\n\n')}\n\nURL afectadas:\n${failedSites.map(r => `• ${r.url}`).join('\n')}`
      );
      console.log('📨 Alerta enviada por Telegram');
    }
  }

  // Enviar notificación de recuperación
  if (hasRecoveries) {
    const lines = recoveredSites.map(r => `• <b>${escapeHtml(r.name)}</b> — ${escapeHtml(r.url)}`);
    await sendRecovery(
      'Sitio(s) recuperado(s)',
      `Los siguientes sitios vuelven a funcionar correctamente:\n\n${lines.join('\n')}`
    );
    console.log('📨 Notificación de recuperación enviada');
  }

  // Resumen final
  const total  = results.length;
  const ok     = results.filter(r => r.ok).length;
  const failed = total - ok;

  console.log(`\n📊 Resumen: ${ok}/${total} sitios OK${failed > 0 ? `, ${failed} CAÍDOS` : ''}\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Error fatal en monitor:', err);
  process.exit(1);
});
