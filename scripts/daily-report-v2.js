#!/usr/bin/env node
const TG_BOT='8663941697:AAFI-5eplKzRMGzeAgqah0MreoqTbAwe-o4';
const TG_CHAT='6307700447';
async function main(){
  const sites=[
    {n:'Hub',u:'https://calculadoras-financieras.es'},
    {n:'Hipoteca',u:'https://simular-hipoteca.es'},
    {n:'IRPF',u:'https://calculadora-irpf.es'},
    {n:'Finiquito',u:'https://calculadora-finiquito.es'},
    {n:'Pensión',u:'https://calculadora-pension.es'},
    {n:'Inversión',u:'https://calculadora-inversion.es'},
    {n:'Ahorro',u:'https://calculadora-ahorro.es'},
    {n:'Préstamo',u:'https://calculadora-prestamo.es'},
    {n:'Salario',u:'https://calculadora-salario.com'},
  ];
  const st=await Promise.all(sites.map(async s=>{
    try{const c=new AbortController();setTimeout(()=>c.abort(),10000);
    const r=await fetch(s.u,{signal:c.signal});return{...s,ok:r.ok};}
    catch(e){return{...s,ok:false};}
  }));
  const up=st.filter(s=>s.ok).length;
  const down=st.filter(s=>!s.ok);
  const f=new Date().toLocaleDateString('es-ES',{timeZone:'Europe/Madrid',weekday:'long',month:'long',day:'numeric'});
  let msg='📊 <b>Informe diario — CalculadorasFinancieras.es</b>\n📅 '+f+'\n\n';
  msg+='<b>Sites online:</b> ✅ '+up+'/9\n';
  if(down.length)msg+='❌ Caídos: '+down.map(s=>s.n).join(', ')+'\n';
  msg+='\n🔗 <a href="https://analytics.google.com/analytics/web">Ver tráfico GA4</a>';
  await fetch('https://api.telegram.org/bot'+TG_BOT+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:TG_CHAT,text:msg,parse_mode:'HTML'})
  });
  console.log('Informe enviado OK');
}
main().catch(e=>{console.error(e.message);process.exit(1);});