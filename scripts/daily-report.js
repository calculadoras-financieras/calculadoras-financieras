#!/usr/bin/env node
/**
 * daily-report.js
 * Genera un informe diario de rendimiento usando Google Analytics 4 Data API
 * y lo envía automáticamente por Telegram.
 *
 * Requiere:
 *   - GA4_PROPERTY_ID: ID de propiedad GA4 (ej: "123456789")
 *   - GA4_SERVICE_ACCOUNT_KEY: JSON de la cuenta de servicio (base64 encoded)
 *   - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *
 * Para obtener GA4_SERVICE_ACCOUNT_KEY:
 *   1. Google Cloud Console → IAM → Cuentas de servicio → Crear
 *   2. Rol: "Visualizador de análisis" en GA4
 *   3. Descargar JSON → base64 encode → guardar en GitHub Secrets
 */

const { sendReport, escapeHtml } = require('./notify-telegram');

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || ''; // ej: "123456789"
const GA4_KEY_B64     = process.env.GA4_SERVICE_ACCOUNT_KEY || '';

// ─── Helper: autenticación con Google ─────────────────────────────────────
async function getGoogleAccessToken(serviceAccountJson) {
  const { createSign } = require('crypto');

  const now    = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim  = Buffer.from(JSON.stringify({
    iss:   serviceAccountJson.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url');

  const unsigned = `${header}.${claim}`;
  const sign     = createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(serviceAccountJson.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const data = await resp.json();
  if (!data.access_token) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Helper: consulta GA4 ─────────────────────────────────────────────────
async function queryGA4(accessToken, propertyId, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

// ─── Formatear número con separadores ─────────────────────────────────────
function fmt(n) {
  const num = parseInt(n) || 0;
  return num.toLocaleString('es-ES');
}

function fmtDecimal(n, decimals = 1) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtTime(seconds) {
  const s = parseInt(seconds) || 0;
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const dateStr = yesterday.toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Madrid',
  });

  // Si no hay credenciales GA4, enviar informe de disponibilidad
  if (!GA4_PROPERTY_ID || !GA4_KEY_B64) {
    const msg = `📊 <b>Informe Diario — CalculadorasFinancieras.es</b>
📅 ${dateStr}

⚠️ <i>Credenciales GA4 no configuradas.</i>
Para activar el informe completo:
1. Crea una cuenta de servicio en Google Cloud
2. Añade GA4_PROPERTY_ID y GA4_SERVICE_ACCOUNT_KEY a GitHub Secrets
3. Consulta INSTRUCCIONES.md → Sección "Configurar informe diario"

<b>Estado de sitios:</b> Verificado por el monitor automático ✅`;

    await sendReport(msg);
    console.log('Informe básico enviado (sin GA4)');
    return;
  }

  // Decodificar cuenta de servicio
  const serviceAccountJson = JSON.parse(Buffer.from(GA4_KEY_B64, 'base64').toString('utf8'));
  const accessToken = await getGoogleAccessToken(serviceAccountJson);

  const dateRange = [{ startDate: 'yesterday', endDate: 'yesterday' }];
  const dateRange7 = [{ startDate: '7daysAgo', endDate: 'yesterday' }];

  // Query 1: métricas principales del día
  const mainReport = await queryGA4(accessToken, GA4_PROPERTY_ID, {
    dateRanges: dateRange,
    metrics: [
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'engagementRate' },
    ],
  });

  // Query 2: páginas más vistas
  const pagesReport = await queryGA4(accessToken, GA4_PROPERTY_ID, {
    dateRanges: dateRange,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 5,
  });

  // Query 3: tendencia 7 días
  const weekReport = await queryGA4(accessToken, GA4_PROPERTY_ID, {
    dateRanges: dateRange7,
    metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
  });

  // Query 4: fuentes de tráfico
  const sourcesReport = await queryGA4(accessToken, GA4_PROPERTY_ID, {
    dateRanges: dateRange,
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 5,
  });

  // Extraer métricas principales
  const m = mainReport?.rows?.[0]?.metricValues || [];
  const sessions    = m[0]?.value || '0';
  const pageViews   = m[1]?.value || '0';
  const totalUsers  = m[2]?.value || '0';
  const newUsers    = m[3]?.value || '0';
  const bounceRate  = m[4]?.value || '0';
  const avgDuration = m[5]?.value || '0';
  const engRate     = m[6]?.value || '0';

  // Semana
  const wm = weekReport?.rows?.[0]?.metricValues || [];
  const wSessions   = wm[0]?.value || '0';
  const wPageViews  = wm[1]?.value || '0';
  const wUsers      = wm[2]?.value || '0';

  // Páginas top
  const topPages = (pagesReport?.rows || []).slice(0, 5).map((row, i) => {
    const page  = row.dimensionValues?.[0]?.value || '/';
    const views = row.metricValues?.[0]?.value || '0';
    return `  ${i+1}. <code>${escapeHtml(page)}</code> — ${fmt(views)} vistas`;
  }).join('\n');

  // Fuentes de tráfico
  const topSources = (sourcesReport?.rows || []).slice(0, 5).map((row, i) => {
    const src  = row.dimensionValues?.[0]?.value || 'Desconocido';
    const sess = row.metricValues?.[0]?.value || '0';
    return `  ${i+1}. ${escapeHtml(src)}: ${fmt(sess)} sesiones`;
  }).join('\n');

  // ─── Construir mensaje ──────────────────────────────────────────────────
  const bounceRateNum = parseFloat(bounceRate) * 100;
  const engRateNum    = parseFloat(engRate) * 100;

  const bounceEmoji = bounceRateNum > 70 ? '🔴' : bounceRateNum > 50 ? '🟡' : '🟢';
  const sessEmoji   = parseInt(sessions) > 100 ? '📈' : parseInt(sessions) > 10 ? '📊' : '📉';

  const report = `📊 <b>Informe Diario — CalculadorasFinancieras.es</b>
📅 ${dateStr}

─────────────────────────────
<b>📈 Ayer en números</b>
${sessEmoji} Sesiones: <b>${fmt(sessions)}</b>
👥 Usuarios: ${fmt(totalUsers)} (${fmt(newUsers)} nuevos)
📄 Páginas vistas: <b>${fmt(pageViews)}</b>
⏱️ Tiempo medio: ${fmtTime(avgDuration)}
${bounceEmoji} Tasa de rebote: ${fmtDecimal(bounceRateNum)}%
💡 Engagement: ${fmtDecimal(engRateNum)}%

─────────────────────────────
<b>📆 Últimos 7 días</b>
Sesiones: ${fmt(wSessions)}
Usuarios: ${fmt(wUsers)}
Páginas vistas: ${fmt(wPageViews)}

─────────────────────────────
<b>🏆 Top páginas ayer</b>
${topPages || '  Sin datos'}

─────────────────────────────
<b>🔍 Fuentes de tráfico</b>
${topSources || '  Sin datos'}

─────────────────────────────
💰 <i>AdSense activo • G-VG8GK7M31B</i>`;

  await sendReport(report);
  console.log('✅ Informe diario enviado por Telegram');
}

main().catch(err => {
  console.error('Error en daily-report:', err);
  process.exit(1);
});
