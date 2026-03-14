#!/usr/bin/env node
/**
 * notify-telegram.js
 * Helper centralizado para enviar mensajes al bot de Telegram.
 * Soporta texto plano, HTML y mensajes con formato enriquecido.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Variables de entorno requeridas: TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID');
  process.exit(1);
}

/**
 * Envía un mensaje a Telegram.
 * @param {string} text  - Texto del mensaje (soporta HTML básico)
 * @param {string} [parseMode='HTML'] - 'HTML' o 'Markdown'
 * @returns {Promise<object>}
 */
async function sendMessage(text, parseMode = 'HTML') {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id:    TELEGRAM_CHAT_ID,
    text:       text,
    parse_mode: parseMode,
    disable_web_page_preview: true,
  });

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data = await resp.json();
  if (!data.ok) throw new Error(`Telegram error: ${data.description}`);
  return data;
}

/**
 * Envía una alerta de error con emoji rojo.
 */
async function sendAlert(title, details) {
  const msg = `🚨 <b>ALERTA: ${escapeHtml(title)}</b>\n\n${escapeHtml(details)}\n\n🕐 ${timestamp()}`;
  return sendMessage(msg);
}

/**
 * Envía una notificación de recuperación con emoji verde.
 */
async function sendRecovery(title, details) {
  const msg = `✅ <b>RECUPERADO: ${escapeHtml(title)}</b>\n\n${escapeHtml(details)}\n\n🕐 ${timestamp()}`;
  return sendMessage(msg);
}

/**
 * Envía un informe diario.
 */
async function sendReport(reportText) {
  return sendMessage(reportText, 'HTML');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function timestamp() {
  return new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
}

module.exports = { sendMessage, sendAlert, sendRecovery, sendReport, escapeHtml, timestamp };
