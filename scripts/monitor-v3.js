#!/usr/bin/env node
const TG_BOT='8663941697:AAFI-5eplKzRMGzeAgqah0MreoqTbAwe-o4';
const TG_CHAT='6307700447';
async function tg(msg){
  await fetch('https://api.telegram.org/bot'+TG_BOT+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:TG_CHAT,text:msg,parse_mode:'HTML'})
  }).catch(()=>{});
}
async function check(url,exp=200){
  try{
    const c=new AbortController();
    setTimeout(()=>c.abort(),15000);
    const r=await fetch(url,{signal:c.signal,redirect:'follow'});
    return{ok:r.status===exp,status:r.status,url};
  }catch(e){return{ok:false,status:0,url,error:e.message};}
}
const CHECKS=[
  {url:'https://calculadoras-financieras.es',label:'Hub'},
  {url:'https://simular-hipoteca.es',label:'Hipoteca'},
  {url:'https://calculadora-irpf.es',label:'IRPF'},
  {url:'https://calculadora-finiquito.es',label:'Finiquito'},
  {url:'https://calculadora-pension.es',label:'Pensión'},
  {url:'https://calculadora-inversion.es',label:'Inversión'},
  {url:'https://calculadora-ahorro.es',label:'Ahorro'},
  {url:'https://calculadora-prestamo.es',label:'Préstamo'},
  {url:'https://calculadora-salario.com',label:'Salario'},
  {url:'https://calculadoras-financieras.es/legal/aviso-legal.html',label:'Legal-Hub'},
  {url:'https://simular-hipoteca.es/aviso-legal.html',label:'Legal-Hipoteca'},
  {url:'https://simular-hipoteca.es/blog/como-calcular-cuota-hipoteca-2026.html',label:'Blog-Hip'},
  {url:'https://calculadora-irpf.es/blog/tramos-irpf-2025-tipos-limites.html',label:'Blog-IRPF'},
  {url:'http://calculadoras-financieras.es',label:'Redirect',exp:301},
];
async function main(){
  const fails=[];
  for(const c of CHECKS){
    const r=await check(c.url,c.exp||200);
    if(!r.ok)fails.push(c.label+': HTTP '+(r.status||'timeout'));
  }
  if(fails.length){
    await tg('🚨 <b>Alerta</b>\n'+new Date().toLocaleString('es-ES',{timeZone:'Europe/Madrid'})+'\n\n'+fails.map(f=>'❌ '+f).join('\n'));
    process.exit(1);
  }else{
    console.log('OK: '+CHECKS.length+' checks — '+new Date().toISOString());
  }
}
main().catch(async e=>{await tg('🚨 Error monitor: '+e.message);process.exit(1);});