#!/usr/bin/env node
/**
 * check-tasks.js
 * Lee las tareas almacenadas en localStorage del navegador...
 * pero como GitHub Actions no tiene browser, usamos una alternativa:
 *
 * Las tareas se sincronizan a un archivo JSON en el repo (tasks.json)
 * desde el frontend, o se pueden editar manualmente.
 *
 * El script lee tasks.json y envía notificaciones para tareas que:
 *   - Vencen hoy
 *   - Vencieron hace 1-3 días y no están completadas (recordatorio)
 *   - Vencen mañana (aviso anticipado)
 */

const { sendMessage, escapeHtml, timestamp } = require('./notify-telegram');
const fs   = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, '..', 'tasks.json');

function loadTasks() {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('No se pudo leer tasks.json:', e.message);
  }
  return [];
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const tasks  = loadTasks();
  const today  = new Date();
  const todayStr    = toDateStr(today);

  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);

  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = toDateStr(yesterday);

  const todayTasks     = tasks.filter(t => !t.completed && t.dueDate === todayStr);
  const tomorrowTasks  = tasks.filter(t => !t.completed && t.dueDate === tomorrowStr);
  const overdueTasks   = tasks.filter(t => !t.completed && t.dueDate < todayStr && t.dueDate >= toDateStr(new Date(today.getTime() - 3*24*60*60*1000)));

  if (todayTasks.length === 0 && tomorrowTasks.length === 0 && overdueTasks.length === 0) {
    console.log('✅ No hay tareas pendientes para hoy/mañana');
    return;
  }

  let msg = `📋 <b>Recordatorio de Tareas — ${today.toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'})}</b>\n\n`;

  if (overdueTasks.length > 0) {
    msg += `🔴 <b>VENCIDAS (requieren atención)</b>\n`;
    overdueTasks.forEach(t => {
      msg += `• ${escapeHtml(t.title)}`;
      if (t.dueDate) msg += ` — venció el ${t.dueDate}`;
      if (t.description) msg += `\n  <i>${escapeHtml(t.description)}</i>`;
      msg += '\n';
    });
    msg += '\n';
  }

  if (todayTasks.length > 0) {
    msg += `🟡 <b>VENCEN HOY</b>\n`;
    todayTasks.forEach(t => {
      msg += `• ${escapeHtml(t.title)}`;
      if (t.priority === 'alta') msg += ' ⚡';
      if (t.description) msg += `\n  <i>${escapeHtml(t.description)}</i>`;
      msg += '\n';
    });
    msg += '\n';
  }

  if (tomorrowTasks.length > 0) {
    msg += `🔵 <b>VENCEN MAÑANA</b>\n`;
    tomorrowTasks.forEach(t => {
      msg += `• ${escapeHtml(t.title)}`;
      if (t.description) msg += `\n  <i>${escapeHtml(t.description)}</i>`;
      msg += '\n';
    });
    msg += '\n';
  }

  msg += `🕐 ${timestamp()}`;

  await sendMessage(msg, 'HTML');
  console.log(`📨 Recordatorio enviado: ${todayTasks.length} hoy, ${tomorrowTasks.length} mañana, ${overdueTasks.length} vencidas`);
}

main().catch(err => {
  console.error('Error en check-tasks:', err);
  process.exit(1);
});
