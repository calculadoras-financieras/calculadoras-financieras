/* CalculadorasFinancieras.es — Auto-Tooltips
   Añade iconos ℹ️ de ayuda a los campos de formulario.
   Añadir en <body> final: <script src="/assets/ux-tooltips.js"></script> */
(function(){
  var TIPS = {
    // Hipoteca
    'capital':         'Importe total del préstamo o hipoteca en euros, sin incluir intereses ni gastos.',
    'importe':         'Cantidad de dinero que necesitas prestada, en euros.',
    'precio':          'Precio de compra o valor del bien financiado, en euros.',
    'interes':         'Tipo de interés anual nominal (TIN). Para hipotecas variables, usa el Euríbor + tu diferencial. Ej: 3,5',
    'tipo':            'Tipo de interés nominal anual en porcentaje. No confundir con TAE.',
    'plazo':           'Duración del préstamo en años. Hipotecas: máx 30 años. Préstamos: 1-10 años.',
    'anios':           'Número de años del préstamo. A más años, menor cuota mensual pero más intereses totales.',
    'anos':            'Número de años del préstamo. A más años, menor cuota mensual pero más intereses totales.',
    'meses':           'Duración en meses. 1 año = 12 meses.',
    'comision':        'Comisión de apertura del préstamo en %. Suma al coste real. Muchos préstamos son 0%.',
    // IRPF / Salario
    'salario':         'Salario bruto anual antes de descontar IRPF ni Seguridad Social, en euros.',
    'bruto':           'Salario bruto anual en euros. Es lo que aparece en el contrato, sin descuentos.',
    'rendimiento':     'Ingresos brutos del trabajo antes de cualquier deducción fiscal.',
    'ccaa':            'Comunidad Autónoma donde pagas impuestos. Cada comunidad tiene su propia escala IRPF.',
    'hijos':           'Número de descendientes menores de 25 años que conviven y dependen de ti fiscalmente.',
    'discapacidad':    'Grado de discapacidad reconocido oficialmente (%). Afecta a reducciones fiscales.',
    // Finiquito
    'fechaInicio':     'Fecha en que empezaste a trabajar en esta empresa (contrato actual).',
    'fechaFin':        'Fecha del último día trabajado. Normalmente coincide con la notificación del despido.',
    'vacaciones':      'Días de vacaciones que tienes derecho al año según convenio (normalmente 22-30 días laborables).',
    'disfrutadas':     'Días de vacaciones ya disfrutados este año natural (desde el 1 de enero).',
    'pagas':           'Número de pagas extras anuales. Lo más habitual es 2 (verano y Navidad).',
    // Pensión
    'cotizados':       'Años cotizados a la Seguridad Social. Consulta tu informe de vida laboral en la Sede Electrónica de la SS.',
    'baseReguladora':  'Media de tus bases de cotización de los últimos 25 años, en euros/mes. Aparece en tu informe de vida laboral.',
    'edadJubilacion':  'Edad prevista de jubilación. La ordinaria en 2025 es 65 años con 38+ años cotizados, o 66 años y 8 meses.',
    // Inversión / Ahorro
    'capitalInicial':  'Dinero que inviertes o ahorras al inicio, en euros. Puede ser 0 si solo harás aportaciones periódicas.',
    'aportacion':      'Cantidad que añades periódicamente (mensual, trimestral...), en euros.',
    'rentabilidad':    'Rentabilidad anual esperada en %. Bolsa española histórica: ~7%. Depósitos 2025: ~2,5-3,5%.',
    'objetivo':        'Cantidad total de dinero que quieres alcanzar, en euros.',
    // General
    'email':           'Tu correo electrónico. Solo para enviarte el resultado.',
    'nombre':          'Tu nombre, solo para personalizar el resultado.',
  };

  function addTooltips(){
    var inputs = document.querySelectorAll('input[type="number"], input[type="text"], select');
    inputs.forEach(function(inp){
      var id = (inp.id || inp.name || '').toLowerCase();
      var tip = null;
      for(var k in TIPS){
        if(id.indexOf(k.toLowerCase()) !== -1){ tip = TIPS[k]; break; }
      }
      if(!tip) return;
      
      // Buscar label asociado
      var lbl = inp.labels && inp.labels[0];
      if(!lbl && inp.id) lbl = document.querySelector('label[for="'+inp.id+'"]');
      if(!lbl) return;
      
      // No duplicar
      if(lbl.parentNode && lbl.parentNode.classList && lbl.parentNode.classList.contains('cf-tooltip-wrap')) return;
      
      // Crear wrap
      var wrap = document.createElement('div');
      wrap.className = 'cf-tooltip-wrap';
      lbl.parentNode.insertBefore(wrap, lbl);
      wrap.appendChild(lbl);
      
      // Botón ℹ️
      var btn = document.createElement('span');
      btn.className = 'cf-info-btn';
      btn.innerHTML = 'i';
      btn.setAttribute('role','button');
      btn.setAttribute('tabindex','0');
      btn.setAttribute('aria-label','Ayuda sobre este campo');
      wrap.appendChild(btn);
      
      // Caja tooltip
      var box = document.createElement('div');
      box.className = 'cf-tooltip-box';
      box.textContent = tip;
      wrap.appendChild(box);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', addTooltips);
  } else {
    addTooltips();
  }
})();
