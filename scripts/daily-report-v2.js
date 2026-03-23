#!/usr/bin/env node
/**
 * daily-report-v2.js — Informe diario de Calculadoras Financieras España
 *
 * Se ejecuta cada día a las 7:00 UTC (8:00 Madrid invierno / 9:00 verano).
 * Envía por Telegram un resumen del estado de todos los sites.
 * Usa GitHub Secrets para los tokens (NUNCA hardcodeados aquí).
 */

'use strict';

const TG_BOT  = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

const SITES = [
  { name: 'Hub Principal',         url: 'https://calculadoras-financieras.es'  },
  { name: 'Simular Hipoteca',      url: 'https://simular-hipoteca.es'           },
  { name: 'Calculadora IRPF',      url: 'https://calculadora-irpf.es'           },
  { name: 'Calculadora Finiquito', url: 'https://calculadora-finiquito.es'      },
  { name: 'Calculadora Pensión',   url: 'https://calculadora-pension.es'        },
  { name: 'Calculadora Inversión', url: 'https://calculadora-inversion.es'      },
  { name: 'Calculadora Ahorro',    url: 'https://calculadora-ahorro.es'         },
  { name: 'Calculadora Préstamo',  url: 'https://calculadora-prestamo.es'       },
  { name: 'Calculadora Salario',   url: 'https://calculadora-salario.com'       },
];

async function checkSite(site) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const start = Date.now();
    const res = await fetch(site.url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    return { ...site, ok: res.ok, status: res.status, ms: Date.now() - start };
  } catch (e) {
    return { ...site, ok: false, status: 0, ms: 0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

async function main() {
  if (!TG_BOT || !TG_CHAT) {
    console.error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en las variables de entorno');
    process.exit(1);
  }

  const now     = new Date();
  const fecha   = now.toLocaleDateString('es-ES',  { timeZone: 'Europe/Madrid', weekday: 'long',  month: 'long', day: 'numeric' });
  const hora    = now.toLocaleTimeString('es-ES',  { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

  // Comprobar todos los sites en paralelo
  const results = await Promise.all(SITES.map(checkSite));

  const up      = results.filter(s => s.ok);
  const down    = results.filter(s => !s.ok);
  const avgMs   = Math.round(up.reduce((a, s) => a + s.ms, 0) / (up.length || 1));

  // Construir mensaje
  const lines = [
    `📊 <b>Informe diario — CalculadorasFinancieras.es</b>`,
    `📅 ${fecha} · ${hora}`,
    ``,
    `<b>Estado de los sites:</b>`,
    ...results.map(s => `${s.ok ? '✅' : '❌'} ${s.name}${s.ok ? ` <i>(${s.ms}ms)</i>` : ` — HTTP ${s.status || 'timeout'}`}`),
    ``,
    up.length === SITES.length
      ? `✅ <b>Todos los sites están online</b> · Tiempo medio: ${avgMs}ms`
      : `⚠️ <b>${down.length} site(s) con problemas</b> · ${up.length}/${SITES.length} online`,
    ``,
    `🔗 <a href="https://analytics.google.com/analytics/web/#/p${process.env.GA4_PROPERTY_ID || ''}/reports/intelligenthome">Ver tráfico en GA4</a>`,
    `📈 <a href="https://dash.cloudflare.com">Cloudflare Dashboard</a>`,
  ];

  const msg = lines.join('\n');

  const res = await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML', disable_web_page_preview: true }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Telegram error:', res.status, body);
    process.exit(1);
  }

  console.log(`Informe enviado OK — ${up.length}/${SITES.length} sites online`);
}

main().catch(e => {
  console.error('Error fatal en daily-report:', e.message);
  process.exit(1);
});
