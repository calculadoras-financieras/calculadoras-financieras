#!/usr/bin/env node
/**
 * monitor-v3.js — Monitor de Calculadoras Financieras España
 *
 * Comprueba cada 15 minutos que todos los sites responden correctamente.
 * Solo envía Telegram si hay fallos nuevos o recuperaciones.
 * Usa GitHub Secrets para los tokens (NUNCA hardcodeados aquí).
 */

'use strict';

const TG_BOT  = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const fs      = require('fs');
const path    = require('path');

// Archivo de estado para detectar recuperaciones (persiste entre runs via cache de GH Actions)
const STATE_FILE = path.join(process.env.RUNNER_TEMP || '/tmp', 'monitor-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch {}
}

async function tg(msg) {
  if (!TG_BOT || !TG_CHAT) { console.log('[TG sin configurar]', msg); return; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
    });
    if (!res.ok) console.error('Telegram error:', res.status);
  } catch (e) {
    console.error('Telegram fetch error:', e.message);
  }
}

async function checkSite(url, expectedStatus, contentCheck) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    const ms = Date.now() - start;

    if (res.status !== expectedStatus) {
      return { ok: false, status: res.status, ms, error: `HTTP ${res.status} (esperado ${expectedStatus})` };
    }

    if (contentCheck) {
      const text = await res.text();
      if (!text.toLowerCase().includes(contentCheck.toLowerCase())) {
        return { ok: false, status: res.status, ms, error: `Contenido esperado no encontrado: "${contentCheck}"` };
      }
    }

    return { ok: true, status: res.status, ms };
  } catch (e) {
    const ms = Date.now() - start;
    const error = e.name === 'AbortError' ? 'Timeout (15s)' : e.message;
    return { ok: false, status: 0, ms, error };
  }
}

// ── Lista de URLs a monitorizar ────────────────────────────────────────────
const CHECKS = [
  // Sites principales
  { id: 'hub',          label: 'Hub Principal',         url: 'https://calculadoras-financieras.es',                                        exp: 200, content: 'calculadora'  },
  { id: 'hipoteca',     label: 'Simular Hipoteca',      url: 'https://simular-hipoteca.es',                                                exp: 200, content: 'hipoteca'     },
  { id: 'irpf',         label: 'Calculadora IRPF',      url: 'https://calculadora-irpf.es',                                                exp: 200, content: 'IRPF'         },
  { id: 'finiquito',    label: 'Calculadora Finiquito',  url: 'https://calculadora-finiquito.es',                                          exp: 200, content: 'finiquito'    },
  { id: 'pension',      label: 'Calculadora Pensión',   url: 'https://calculadora-pension.es',                                             exp: 200, content: 'pensi'        },
  { id: 'inversion',    label: 'Calculadora Inversión', url: 'https://calculadora-inversion.es',                                          exp: 200, content: 'inversi'      },
  { id: 'ahorro',       label: 'Calculadora Ahorro',    url: 'https://calculadora-ahorro.es',                                              exp: 200, content: 'ahorro'       },
  { id: 'prestamo',     label: 'Calculadora Préstamo',  url: 'https://calculadora-prestamo.es',                                           exp: 200, content: 'préstamo'     },
  { id: 'salario',      label: 'Calculadora Salario',   url: 'https://calculadora-salario.com',                                            exp: 200, content: 'salario'      },
  // Páginas legales
  { id: 'legal-hub',    label: 'Legal Hub',             url: 'https://calculadoras-financieras.es/legal/aviso-legal.html',                 exp: 200 },
  { id: 'legal-hip',    label: 'Legal Hipoteca',        url: 'https://simular-hipoteca.es/aviso-legal.html',                              exp: 200 },
  // Blog (verifica que los artículos existen y no redirigen a la calculadora)
  { id: 'blog-hip',     label: 'Blog Hipoteca',         url: 'https://simular-hipoteca.es/blog/como-calcular-cuota-hipoteca-2026.html',    exp: 200, content: 'hipoteca'     },
  { id: 'blog-irpf',    label: 'Blog IRPF',             url: 'https://calculadora-irpf.es/blog/tramos-irpf-2025-tipos-limites.html',       exp: 200, content: 'IRPF'         },
  { id: 'blog-ahorro',  label: 'Blog Ahorro',           url: 'https://calculadora-ahorro.es/blog/calcular-cuanto-ahorrar-cada-mes.html',   exp: 200, content: 'ahorro'       },
  { id: 'blog-salario', label: 'Blog Salario',          url: 'https://calculadora-salario.com/blog/salario-bruto-vs-salario-neto.html',    exp: 200, content: 'salario'      },
  // ads.txt (necesario para AdSense)
  { id: 'ads-hub',      label: 'ads.txt Hub',           url: 'https://calculadoras-financieras.es/ads.txt',                               exp: 200, content: 'pub-'         },
  { id: 'ads-hip',      label: 'ads.txt Hipoteca',      url: 'https://simular-hipoteca.es/ads.txt',                                       exp: 200, content: 'pub-'         },
  // Sitemaps
  { id: 'sitemap-hub',  label: 'Sitemap Hub',           url: 'https://calculadoras-financieras.es/sitemap.xml',                           exp: 200, content: 'urlset'        },
  { id: 'sitemap-hip',  label: 'Sitemap Hipoteca',      url: 'https://simular-hipoteca.es/sitemap.xml',                                   exp: 200, content: 'urlset'        },
];

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  const now   = new Date();
  const tsEs  = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' });
  const state = loadState();

  console.log(`[${now.toISOString()}] Ejecutando ${CHECKS.length} checks en paralelo...`);

  // Todos los checks en paralelo para máxima velocidad
  const results = await Promise.all(
    CHECKS.map(async (c) => {
      const r = await checkSite(c.url, c.exp || 200, c.content || null);
      return { ...c, ...r };
    })
  );

  const failures  = results.filter(r => !r.ok);
  const recovered = [];
  const newFails  = [];

  for (const r of results) {
    const wasDown = state[r.id] === 'down';
    if (!r.ok && !wasDown) newFails.push(r);
    if (r.ok  &&  wasDown) recovered.push(r);
    state[r.id] = r.ok ? 'up' : 'down';
  }

  saveState(state);

  // Log completo en consola de GH Actions
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`  ${icon} [${r.status || 'ERR'}] ${r.label.padEnd(25)} ${r.ms}ms${r.error ? ' — ' + r.error : ''}`);
  }

  // Notificar fallos nuevos
  if (newFails.length > 0) {
    const lines = newFails.map(r => `❌ <b>${r.label}</b>: ${r.error}`).join('\n');
    const msg = [
      `🚨 <b>ALERTA — ${newFails.length} site(s) caído(s)</b>`,
      tsEs,
      '',
      lines,
      '',
      `<i>Se notificará aquí cuando se recuperen.</i>`,
    ].join('\n');
    await tg(msg);
    console.log(`⚠ Alerta enviada: ${newFails.length} fallo(s) nuevo(s)`);
  }

  // Notificar recuperaciones
  if (recovered.length > 0) {
    const lines = recovered.map(r => `✅ <b>${r.label}</b>`).join('\n');
    const msg = [
      `✅ <b>RECUPERADO — ${recovered.length} site(s) vuelven a funcionar</b>`,
      tsEs,
      '',
      lines,
    ].join('\n');
    await tg(msg);
    console.log(`✓ Recuperación notificada: ${recovered.length} site(s)`);
  }

  const ok = CHECKS.length - failures.length;
  console.log(`\nResultado: ${ok}/${CHECKS.length} OK — ${tsEs}`);

  if (failures.length > 0) {
    process.exit(1); // GitHub Actions marca el run como fallido
  }
}

main().catch(async (e) => {
  console.error('Error fatal en monitor:', e.message);
  await tg(`🚨 <b>Error interno del monitor</b>\n${e.message}\n\nRevisar logs en GitHub Actions.`);
  process.exit(1);
});
