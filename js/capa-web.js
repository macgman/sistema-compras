/* ===== CAPA WEB: rutas, tema, menú, Ctrl+K, gráficas, respaldo, PWA ===== */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
function setTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('wr-theme',t)}catch(e){}
  var m=$('meta[name=theme-color]');if(m)m.content=t==='dark'?'#0b1220':'#064e3b';
  var b=$('#wr-theme');if(b)b.innerHTML=t==='dark'?'<i class="fas fa-sun"></i>':'<i class="fas fa-moon"></i>';}
function toggleTheme(){setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')}
function toast(m,t){if(typeof showToast==='function')showToast(m,t)}
/* ---- Rutas por URL (#/inventario) ---- */
function routeName(){var h=location.hash.replace(/^#\/?/,'');return h&&document.getElementById('section-'+h)?h:null}
function allowed(n){var a=document.getElementById('nav-'+n);return !(a&&a.classList.contains('admin-only')&&!(typeof currentUser!=='undefined'&&currentUser&&currentUser.role==='admin'))}
var origShow=window.showSection;
window.showSection=function(name){
  var r=origShow.apply(this,arguments);
  try{if(name&&document.getElementById('section-'+name)){
    if(location.hash!=='#/'+name)history.pushState(null,'','#/'+name);
    var a=document.getElementById('nav-'+name),l=a&&a.querySelector('span');
    document.title=(l?l.textContent+' · ':'')+'COMPRA';}}catch(e){}
  return r;};
window.addEventListener('hashchange',function(){var n=routeName();if(n&&allowed(n)&&currentUser)origShow(n)});
var origRole=window.applyUserRole;
if(origRole)window.applyUserRole=function(){var r=origRole.apply(this,arguments);var n=routeName();if(n&&n!=='dashboard'&&allowed(n))window.showSection(n);buildUser();armIdle();return r;};
/* ---- Barra superior: buscar, tema, menú de usuario ---- */
var deferredInstall=null;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredInstall=e});
function buildTools(){
  var bar=$('#topbar');if(!bar||$('.wr-tools'))return;
  var cloud=$('#cloud-status-badge');if(!cloud)return;
  var w=document.createElement('div');w.className='wr-tools no-print';
  w.innerHTML='<button class="wr-btn" id="wr-find" title="Buscar (Ctrl+K)"><i class="fas fa-magnifying-glass"></i><span>Buscar</span><kbd>Ctrl K</kbd></button>'+
   '<button class="wr-btn wr-bell" id="wr-bell" title="Alertas de stock"><i class="fas fa-bell"></i><b id="wr-bn" style="display:none">0</b></button>'+
   '<div class="wr-pop" id="wr-pop"></div>'+
   '<button class="wr-btn" id="wr-theme" title="Modo claro/oscuro"></button>'+
   '<button class="wr-avatar" id="wr-av" aria-label="Menú de usuario">?</button>'+
   '<div class="wr-menu" id="wr-menu"><div class="wr-who" id="wr-who"></div>'+
   '<button id="wr-acc"><i class="fas fa-user"></i> Mi cuenta</button>'+
   '<button id="wr-prefs"><i class="fas fa-sliders"></i> Preferencias</button>'+
   '<button id="wr-pw"><i class="fas fa-key"></i> Cambiar contraseña</button>'+
   '<button id="wr-help"><i class="fas fa-circle-question"></i> Ayuda y atajos</button>'+
   '<button id="wr-fs"><i class="fas fa-expand"></i> Pantalla completa</button>'+
   '<button id="wr-link"><i class="fas fa-link"></i> Copiar enlace de esta pantalla</button>'+
   '<button id="wr-install"><i class="fas fa-download"></i> Instalar aplicación</button>'+
   '<button id="wr-backup"><i class="fas fa-file-export"></i> Respaldo (JSON)</button>'+
   '<button id="wr-out"><i class="fas fa-right-from-bracket"></i> Cerrar sesión</button></div>';
  cloud.parentNode.insertBefore(w,cloud);
  $('#wr-find').onclick=openPal;$('#wr-theme').onclick=toggleTheme;
  $('#wr-av').onclick=function(e){e.stopPropagation();$('#wr-menu').classList.toggle('open')};
  document.addEventListener('click',function(){var m=$('#wr-menu');if(m)m.classList.remove('open')});
  $('#wr-out').onclick=function(){logout()};
  $('#wr-backup').onclick=backup;
  $('#wr-install').onclick=installApp;$('#wr-acc').onclick=showAccount;$('#wr-prefs').onclick=showPrefs;$('#wr-help').onclick=showHelp;$('#wr-fs').onclick=fullscreen;$('#wr-pw').onclick=function(){if(window.wrChangePw)window.wrChangePw()};$('#wr-link').onclick=function(){try{navigator.clipboard.writeText(location.href).then(function(){toast('Enlace copiado')})}catch(e){}};var pp=$('#wr-pop');pp.addEventListener('click',function(e){e.stopPropagation();var t=e.target.closest('[data-a]');if(t)alertAct(t.getAttribute('data-a'),t.getAttribute('data-k'))});
  $('#wr-bell').onclick=function(e){e.stopPropagation();bell(true)};document.addEventListener('click',function(e){var p=$('#wr-pop');if(p&&!p.contains(e.target))p.classList.remove('open')});
  setTheme(document.documentElement.getAttribute('data-theme')||'light');
}
function buildUser(){buildTools();if(typeof currentUser==='undefined'||!currentUser)return;
  var n=currentUser.name||currentUser.username||'?';$('#wr-av').textContent=n.trim().charAt(0).toUpperCase();
  $('#wr-who').innerHTML='<b>'+String(n).replace(/[<&]/g,'')+'</b><small>'+({admin:'Administrador',folio:'Usuario + Folio'}[currentUser.role]||'Usuario')+'</small>';}
/* ---- Respaldo JSON (solo lectura de los datos) ---- */
function backup(){try{
  var d={app:'COMPRA',version:ver(),exportado:new Date().toISOString(),
    products:typeof products!=='undefined'?products:[],ventas:typeof ventas!=='undefined'?ventas:[],
    movimientos:typeof movimientos!=='undefined'?movimientos:[],valesManuales:typeof valesManuales!=='undefined'?valesManuales:[],
    valesInventario:typeof valesInventario!=='undefined'?valesInventario:[]};
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d)],{type:'application/json'}));
  a.download='respaldo-compra-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);pset('wr-lastbackup',Date.now());toast('Respaldo descargado');bell(false);
  }catch(e){toast('No se pudo generar el respaldo','error')}}
/* ---- Paleta Ctrl+K ---- */
var items=[],sel=0;
function collect(){items=[];document.querySelectorAll('#sidebar nav a').forEach(function(a){if(a.offsetParent!==null){var s=a.querySelector('span');items.push({t:s?s.textContent:a.textContent.trim(),i:(a.querySelector('i')||{}).className||'fas fa-arrow-right',f:function(){a.click()}})}});
  items.push({t:'Cambiar modo claro/oscuro',i:'fas fa-circle-half-stroke',f:toggleTheme},{t:'Descargar respaldo (JSON)',i:'fas fa-file-export',f:backup},{t:'Cerrar sesión',i:'fas fa-right-from-bracket',f:function(){logout()}});}
function found(q){var r=[];if(q.length<2||typeof currentUser==='undefined'||!currentUser)return r;
  (typeof products!=='undefined'?products:[]).some(function(p){if(r.length>=6)return true;
    if(((p.clave||'')+' '+(p.descripcion||'')+' '+(p.partida||'')).toLowerCase().indexOf(q)>-1)r.push({t:'Material: '+String(p.descripcion||p.clave).slice(0,60)+(p.clave&&p.clave!=='N/A'?' ('+p.clave+')':''),i:'fas fa-box',f:function(){goInv(p)}});return false});
  var n=0;(typeof ventas!=='undefined'?ventas:[]).some(function(v){if(n>=5)return true;
    if(((v.folio||'')+' '+(v.cliente||'')).toLowerCase().indexOf(q)>-1){n++;r.push({t:'Compra '+(v.folio||'')+(v.cliente?' · '+v.cliente:''),i:'fas fa-receipt',f:function(){window.showSection('historial-ventas');setTimeout(function(){var s=$('#hv-search');if(s){s.value=v.folio||'';s.dispatchEvent(new Event('input'))}},80)}})}return false});
  return r}
function draw(){var q=$('#wr-pal-in').value.toLowerCase().trim(),ul=$('#wr-pal-list');ul.innerHTML='';
  var list=items.filter(function(x){return x.t.toLowerCase().indexOf(q)>-1}).concat(found(q));if(sel>=list.length)sel=0;
  list.forEach(function(x,k){var li=document.createElement('li');li.className=k===sel?'sel':'';li.innerHTML='<i class="'+x.i+'"></i>';li.appendChild(document.createTextNode(x.t));
    li.onclick=function(){closePal();x.f()};ul.appendChild(li)});ul._l=list;}
function openPal(){if(typeof currentUser==='undefined'||!currentUser)return;collect();sel=0;$('#wr-pal').classList.add('open');var i=$('#wr-pal-in');i.value='';draw();i.focus()}
function closePal(){$('#wr-pal').classList.remove('open')}
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#wr-pal').classList.contains('open')?closePal():openPal();return}
  if(!$('#wr-pal').classList.contains('open'))return;var ul=$('#wr-pal-list'),l=ul._l||[];
  if(e.key==='Escape')closePal();
  else if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(sel+1,l.length-1);draw()}
  else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(sel-1,0);draw()}
  else if(e.key==='Enter'&&l[sel]){e.preventDefault();var f=l[sel].f;closePal();f()}});
$('#wr-pal').addEventListener('mousedown',function(e){if(e.target===this)closePal()});
$('#wr-pal-in').addEventListener('input',function(){sel=0;draw()});
/* ---- Gráficas del Dashboard (solo lectura de ventas y products) ---- */
function ym(f){f=String(f||'');var m=f.match(/^(\d{4})-(\d{2})/);if(m)return m[1]+'-'+m[2];
  m=f.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);return m?m[3]+'-'+('0'+m[2]).slice(-2):null}
function money(n){return '$'+(typeof fmt==='function'?fmt(n):Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2}))}
var MES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function ld(d){d=d||new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function vd(f){f=String(f||'');var m=f.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=f.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);return m?m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2):''}
function agg(V,from,to){var s=0,c=0;V.forEach(function(v){var d=vd(v.fecha);if(d&&d>=from&&d<=to){s+=Number(v.total)||0;c++}});return{s:s,c:c}}
function span(per){var n=new Date(),t=ld(n),r;
  if(per==='hoy'){var y=new Date(n);y.setDate(y.getDate()-1);r={from:t,to:t,pf:ld(y),pt:ld(y),lab:'Hoy ('+n.getDate()+' '+MES[n.getMonth()]+')',cmp:'vs ayer'}}
  else if(per==='todo')r={from:'0000-00-00',to:'9999-99-99',pf:null,pt:null,lab:'Histórico',cmp:''};
  else{var pm=new Date(n.getFullYear(),n.getMonth()-1,1),dim=new Date(n.getFullYear(),n.getMonth(),0).getDate(),dd=Math.min(n.getDate(),dim);
    r={from:ld(new Date(n.getFullYear(),n.getMonth(),1)),to:t,pf:ld(pm),pt:ld(new Date(pm.getFullYear(),pm.getMonth(),dd)),lab:'Este mes (1–'+n.getDate()+' '+MES[n.getMonth()]+')',cmp:'vs mismo tramo del mes anterior (1–'+dd+' '+MES[pm.getMonth()]+')'}}
  return r}
function getPer(){try{var p=localStorage.getItem('wr-dash-per');return p==='hoy'||p==='todo'?p:'mes'}catch(e){return'mes'}}
function setPer(p){try{localStorage.setItem('wr-dash-per',p)}catch(e){}charts()}
(function(){if($('#wr-dash-css'))return;var s=document.createElement('style');s.id='wr-dash-css';s.textContent='.wr-seg{display:inline-flex;border:1px solid var(--border);border-radius:9px;overflow:hidden}.wr-seg button{border:0;background:var(--card);color:var(--text);padding:5px 12px;font:600 .78rem system-ui;cursor:pointer}.wr-seg button.on{background:var(--primary);color:#fff}.wr-dh{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px}.wr-dh h4{margin:0!important}.wr-upd{font-size:.72rem;color:var(--text-light)}';document.head.appendChild(s)})();
function charts(){var host=$('#stats-grid');if(!host)return;var c=$('#wr-charts');
  if(!c){c=document.createElement('div');c.id='wr-charts';host.parentNode.insertBefore(c,host.nextSibling)}
  var V=typeof ventas!=='undefined'?ventas:[],P=typeof products!=='undefined'?products:[],M=typeof movimientos!=='undefined'?movimientos:[];
  var per=getPer(),sp=span(per),now=new Date(),keys=[],tot={};
  for(var k=5;k>=0;k--){var d=new Date(now.getFullYear(),now.getMonth()-k,1),key=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);keys.push(key);tot[key]=0}
  V.forEach(function(v){var key=ym(v.fecha);if(key in tot)tot[key]+=Number(v.total)||0});
  var max=Math.max.apply(null,keys.map(function(k){return tot[k]}))||1,any=keys.some(function(k){return tot[k]>0});
  var bars=any?'<div class="wr-bars">'+keys.map(function(k,i){return '<div title="'+money(tot[k])+(i===5?' (mes en curso, parcial)':'')+'"><i style="height:'+Math.round(tot[k]/max*100)+'%'+(i===5?';opacity:.7':'')+'"></i>'+MES[+k.slice(5)-1]+(i===5?'*':'')+'</div>'}).join('')+'</div><small class="wr-upd">* Mes en curso: incompleto hasta el día '+now.getDate()+'</small>':'<div class="wr-empty">Aún no hay compras en los últimos 6 meses</div>';
  var cr=0,me=0,al=0;P.forEach(function(p){var q=Number(p.cantidad)||0,m=typeof window.wrMin==='function'?window.wrMin(p):5;q<=m?cr++:q<=20?me++:al++});var n=P.length||1;
  function row(l,v,col){return '<div class="row"><span style="width:120px">'+l+'</span><div class="bar"><i style="width:'+Math.round(v/n*100)+'%;background:'+col+'"></i></div><b>'+v+'</b></div>'}
  var cur=agg(V,sp.from,sp.to),prev=sp.pf?agg(V,sp.pf,sp.pt):null,df=prev&&prev.s>0?Math.round((cur.s-prev.s)/prev.s*100):null;
  var kp='<div class="wr-kpis"><div><small>Compras (monto)</small><b>'+money(cur.s)+'</b><em class="'+(df!==null&&df<0?'down':'up')+'">'+(df!==null?(df<0?'▼ ':'▲ ')+Math.abs(df)+'% '+sp.cmp:(prev?'sin compras en el periodo anterior':''))+'</em></div><div><small>Registros de compra</small><b>'+cur.c+'</b><em>'+(prev?'antes: '+prev.c:'')+'</em></div><div><small>Promedio por compra</small><b>'+money(cur.c?cur.s/cur.c:0)+'</b><em>&nbsp;</em></div></div>';
  var ag={};V.forEach(function(v){var d=vd(v.fecha);if(!d||d<sp.from||d>sp.to)return;(v.items||[]).forEach(function(i){var t=String(i.descripcion||i.clave||'');ag[t]=(ag[t]||0)+(Number(i.cantidad)||0)})});
  var top=Object.keys(ag).map(function(t){return[t,ag[t]]}).sort(function(a,b){return b[1]-a[1]}).slice(0,5),tm=top.length?top[0][1]:1;
  var tp=top.length?top.map(function(t){return '<div class="row"><span style="flex:0 0 46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc2(t[0])+'">'+esc2(t[0])+'</span><div class="bar"><i style="width:'+Math.round(t[1]/tm*100)+'%;background:#059669"></i></div><b>'+t[1]+'</b></div>'}).join(''):'<div class="wr-empty">Sin compras en este periodo</div>';
  var MM=M.slice().sort(function(a,b){return(Number(b.kardexTimestamp)||Number(b.id)||0)-(Number(a.kardexTimestamp)||Number(a.id)||0)}).slice(0,6);
  var ac=MM.map(function(x){var en=/ENTRADA/i.test(x.type);return '<div class="r"><span class="t" style="background:'+(en?'#059669':'#ef4444')+'">'+esc2(x.type||'')+'</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc2(x.desc||'')+'</span><b>'+(Number(x.qty)||0)+'</b><small style="color:var(--text-light)">'+esc2(x.user||'')+'</small></div>'}).join('')||'<div class="wr-empty">Sin movimientos recientes</div>';
  var seg='<span class="wr-seg">'+[['hoy','Hoy'],['mes','Este mes'],['todo','Histórico']].map(function(o){return '<button data-p="'+o[0]+'" class="'+(per===o[0]?'on':'')+'">'+o[1]+'</button>'}).join('')+'</span>';
  c.innerHTML='<div class="card" style="grid-column:1/-1"><div class="wr-dh"><h4>Resumen · '+sp.lab+'</h4><span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+seg+'<span class="wr-upd">Actualizado '+now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})+'</span><button class="wr-btn" id="wr-dash-ref" title="Actualizar ahora" style="height:30px"><i class="fas fa-rotate"></i></button></span></div>'+kp+'</div><div class="card"><h4>Compras por mes (últimos 6)</h4>'+bars+'</div><div class="card wr-dist"><h4>Estado del inventario</h4>'+(P.length?row('Crítico (≤ mínimo)',cr,'#ef4444')+row('Medio (hasta 20)',me,'#f59e0b')+row('Suficiente (>20)',al,'#10b981'):'<div class="wr-empty">Sin materiales registrados</div>')+'</div><div class="card wr-dist"><h4>Top 5 materiales más comprados · '+sp.lab+'</h4>'+tp+'</div><div class="card wr-act"><h4>Actividad reciente</h4>'+ac+'</div>';
  Array.prototype.forEach.call(c.querySelectorAll('.wr-seg button'),function(b){b.onclick=function(){setPer(b.dataset.p)}});
  var rf=$('#wr-dash-ref');if(rf)rf.onclick=function(){if(typeof window.renderDashboard==='function')window.renderDashboard();else charts()}}
setInterval(function(){try{if(typeof currentUser==='undefined'||!currentUser||document.hidden)return;var s=document.getElementById('section-dashboard');if(!s||getComputedStyle(s).display==='none')return;if(typeof window.renderDashboard==='function')window.renderDashboard()}catch(e){}},60000);
var origDash=window.renderDashboard;
if(origDash)window.renderDashboard=function(){var r=origDash.apply(this,arguments);try{charts();bell(false)}catch(e){}return r};
/* ---- Conexión, splash y PWA ---- */
function net(){$('#wr-off').style.display=navigator.onLine?'none':'block'}
window.addEventListener('online',function(){net();toast('Conexión restablecida')});window.addEventListener('offline',net);net();
function hideSplash(){var s=$('#wr-splash');if(s){s.classList.add('out');setTimeout(function(){s.remove()},500)}}
if(document.readyState==='complete')setTimeout(hideSplash,300);else window.addEventListener('load',function(){setTimeout(hideSplash,300)});
setTimeout(hideSplash,5000);

/* ---- Modal genérico, instalación, cuenta, preferencias, ayuda ---- */
function modal(title,icon,html){var m=$('#wr-modal');if(!m){m=document.createElement('div');m.id='wr-modal';document.body.appendChild(m);
  m.addEventListener('mousedown',function(e){if(e.target===m)m.classList.remove('open')})}
  m.innerHTML='<div class="box"><button class="wr-close" aria-label="Cerrar">&times;</button><h3><i class="fas '+icon+'"></i>'+title+'</h3>'+html+'</div>';
  m.querySelector('.wr-close').onclick=function(){m.classList.remove('open')};m.classList.add('open');var mm=$('#wr-menu');if(mm)mm.classList.remove('open');return m}
function installApp(){
  if(window.matchMedia('(display-mode: standalone)').matches){modal('Aplicación instalada','fa-circle-check','<p>Ya estás usando COMPRA como aplicación instalada.</p>');return}
  if(deferredInstall){deferredInstall.prompt();deferredInstall=null;return}
  var secure=/^https:/.test(location.protocol)||location.hostname==='localhost';
  modal('Instalar COMPRA','fa-download',secure
   ?'<p>Tu navegador no ofreció la instalación automática. Hazlo manualmente:</p><ul><li><b>Edge:</b> menú <b>⋯</b> → <b>Aplicaciones</b> → <b>Instalar este sitio como una aplicación</b>.</li><li><b>Chrome:</b> menú <b>⋮</b> → <b>Transmitir, guardar y compartir</b> → <b>Instalar COMPRA</b>.</li><li><b>iPhone/iPad (Safari):</b> botón compartir → <b>Agregar a pantalla de inicio</b>.</li></ul>'
   :'<p>Esta copia está abierta como <b>archivo local</b> ('+location.protocol+'). Los navegadores solo permiten instalar apps desde una dirección <b>https://</b>.</p><ul><li>Sube todos los archivos de la carpeta a tu sitio (por ejemplo GitHub Pages).</li><li>Abre esa dirección https y aquí aparecerá la instalación.</li></ul>');}
function showAccount(){var u=(typeof currentUser!=='undefined'&&currentUser)||{};var st=($('#cloud-status-text')||{}).textContent||'—';
  var rl={admin:'Administrador',folio:'Usuario + Folio'}[u.role]||'Usuario';
  var P=typeof products!=='undefined'?products.length:0,V=typeof ventas!=='undefined'?ventas.length:0;
  modal('Mi cuenta','fa-user','<table><tr><td>Nombre</td><td><b>'+esc2(u.name||'')+'</b></td></tr><tr><td>Usuario</td><td>'+esc2(u.username||'')+'</td></tr><tr><td>Rol</td><td>'+rl+'</td></tr><tr><td>Conexión</td><td>'+esc2(st)+'</td></tr><tr><td>Materiales</td><td>'+P+'</td></tr><tr><td>Compras registradas</td><td>'+V+'</td></tr><tr><td>Versión</td><td>COMPRA '+ver()+'</td></tr></table>')}
function esc2(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function pref(k,d){try{return localStorage.getItem('wr-'+k)||d}catch(e){return d}}
function setPref(k,v){try{localStorage.setItem('wr-'+k,v)}catch(e){}applyPrefs()}
function applyPrefs(){var h=document.documentElement;h.setAttribute('data-dens',pref('dens','normal'));h.setAttribute('data-fs',pref('fs','md'));armIdle()}
function showPrefs(){var m=modal('Preferencias','fa-sliders','<div class="opt"><span>Tema</span><select id="p-th"><option value="light">Claro</option><option value="dark">Oscuro</option></select></div>'+
  '<div class="opt"><span>Densidad de tablas</span><select id="p-de"><option value="normal">Normal</option><option value="compact">Compacta</option></select></div>'+
  '<div class="opt"><span>Tamaño del contenido</span><select id="p-fs"><option value="md">Normal</option><option value="lg">Grande</option><option value="xl">Muy grande</option></select></div>'+
  '<div class="opt"><span>Cerrar sesión por inactividad</span><select id="p-id"><option value="0">Nunca</option><option value="15">15 minutos</option><option value="30">30 minutos</option><option value="60">60 minutos</option></select></div>');
  $('#p-th').value=document.documentElement.getAttribute('data-theme');$('#p-de').value=pref('dens','normal');$('#p-fs').value=pref('fs','md');$('#p-id').value=pref('idle','0');
  $('#p-th').onchange=function(){setTheme(this.value)};$('#p-de').onchange=function(){setPref('dens',this.value)};$('#p-fs').onchange=function(){setPref('fs',this.value)};$('#p-id').onchange=function(){setPref('idle',this.value)}}
function showHelp(){modal('Ayuda y atajos','fa-circle-question','<table><tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Buscar secciones y acciones</td></tr><tr><td><kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd></td><td>Ir a la sección del menú por posición</td></tr><tr><td><kbd>Alt</kbd>+<kbd>T</kbd></td><td>Cambiar modo claro/oscuro</td></tr><tr><td><kbd>?</kbd></td><td>Abrir esta ayuda</td></tr><tr><td><kbd>Esc</kbd></td><td>Cerrar ventanas</td></tr></table><p style="margin-top:12px">Cada pantalla tiene su propia dirección (<code>#/inventario</code>, <code>#/kardex</code>…), así que puedes guardarla en favoritos o compartirla.</p>')}
function fullscreen(){try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}catch(e){}}
/* ---- Alertas de stock con estado leído ---- */
function pget(k){try{return localStorage.getItem(k)}catch(e){return null}}
function pset(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function ver(){var m=document.title.match(/(\d+\.\d+\.\d+)/)||(($('title')||{}).textContent||'').match(/(\d+\.\d+\.\d+)/);return m?m[1]:''}
function thr(p){return window.wrMin?window.wrMin(p):5}
function crit(){return(typeof products!=='undefined'?products:[]).filter(function(p){return(Number(p.cantidad)||0)<=thr(p)})}
function pid(p){return String(p.id!=null?p.id:(p.clave||'')+'|'+(p.descripcion||''))}
function uk(){return 'wr-read-'+((typeof currentUser!=='undefined'&&currentUser&&(currentUser.username||currentUser.name))||'anon')}
function readMap(){try{return JSON.parse(pget(uk())||'{}')}catch(e){return {}}}
function saveRead(m){pset(uk(),JSON.stringify(m))}
function split(){var m=readMap(),ch=false,un=[],rd=[];
  (typeof products!=='undefined'?products:[]).forEach(function(p){var k=pid(p),q=Number(p.cantidad)||0;
    if(q>thr(p)){if(k in m){delete m[k];ch=true}return}
    if(k in m&&q>=m[k])rd.push(p);else un.push(p)});
  if(ch)saveRead(m);return{un:un,rd:rd}}
function bkDue(){var l=+(pget('wr-lastbackup')||0),s=+(pget('wr-bksnooze')||0),n=Date.now();return n>s&&(!l||n-l>7*864e5)}
function badge(s){var b=$('#wr-bn');if(!b)return;var n=s.un.length+(bkDue()?1:0);b.textContent=n>99?'99+':n;b.style.display=n?'block':'none'}
var showRd=false;
function bell(open){var s=split();badge(s);var p=$('#wr-pop');if(!p)return;if(open)p.classList.toggle('open');if(p.classList.contains('open'))renderPop(s)}
function itRow(x,read){var q=Number(x.cantidad)||0,k=esc2(pid(x));
  return '<div class="it"><span data-a="go" data-k="'+k+'">'+esc2(String(x.descripcion||x.clave).slice(0,52))+'</span><em>'+q+'</em><button data-a="'+(read?'un':'rd')+'" data-k="'+k+'" title="'+(read?'Restaurar alerta':'Marcar como leída')+'">'+(read?'↺':'✓')+'</button></div>'}
function renderPop(s){var h='<h5><span><i class="fas fa-bell"></i> Alertas</span>'+(s.un.length||bkDue()?'<button class="lnk" data-a="all">✓ Marcar todas como leídas</button>':'')+'</h5><div class="body">';
  if(bkDue())h+='<div class="it"><span><b>Respaldo pendiente:</b> hace más de 7 días sin descargar uno.</span><button data-a="bk" title="Descargar ahora">⬇</button></div>';
  if(!s.un.length&&!bkDue())h+='<div class="wr-empty">Todo al día ✓<br>No hay alertas sin leer</div>';
  s.un.slice(0,30).forEach(function(x){h+=itRow(x,false)});
  if(s.un.length>30)h+='<div class="wr-empty">y '+(s.un.length-30)+' más sin leer…</div>';
  if(s.rd.length){h+='<div class="foot2"><a data-a="tg">'+(showRd?'Ocultar':'Ver')+' leídas ('+s.rd.length+')</a></div>';if(showRd)s.rd.slice(0,30).forEach(function(x){h+=itRow(x,true)})}
  $('#wr-pop').innerHTML=h+'</div><div class="pf"><a data-a="inv">Ver inventario →</a><a data-a="xl">Exportar a Excel</a></div>'}
function alertAct(a,k){var P=typeof products!=='undefined'?products:[],p=P.filter(function(x){return pid(x)===k})[0],m=readMap();
  if(a==='all'){split().un.forEach(function(x){m[pid(x)]=Number(x.cantidad)||0});saveRead(m);pset('wr-bksnooze',Date.now()+864e5)}
  else if(a==='rd'&&p){m[k]=Number(p.cantidad)||0;saveRead(m)}
  else if(a==='un'){delete m[k];saveRead(m)}
  else if(a==='tg')showRd=!showRd;
  else if(a==='bk')backup();
  else if(a==='inv'){$('#wr-pop').classList.remove('open');window.showSection('inventario')}
  else if(a==='xl')exportCrit();
  else if(a==='go'&&p){$('#wr-pop').classList.remove('open');goInv(p)}
  bell(false)}
function goInv(p){window.showSection('inventario');setTimeout(function(){var s=$('#inv-search');if(s){s.value=(p.clave&&p.clave!=='N/A')?p.clave:p.descripcion;s.dispatchEvent(new Event('input'))}},80)}
function dl(blob,name){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},800)}
function exportCrit(){if(typeof ExcelJS==='undefined'){toast('El módulo de Excel aún no carga; reintenta en unos segundos','error');return}
  var wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Stock crítico');
  ws.columns=[{header:'Clave',key:'a',width:16},{header:'Descripción',key:'b',width:72},{header:'Unidad',key:'c',width:20},{header:'Stock',key:'d',width:10}];
  crit().forEach(function(p){ws.addRow({a:p.clave,b:p.descripcion,c:p.unidad,d:Number(p.cantidad)||0})});ws.getRow(1).font={bold:true};
  wb.xlsx.writeBuffer().then(function(b){dl(new Blob([b],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'stock-critico-'+new Date().toISOString().slice(0,10)+'.xlsx');toast('Excel generado')})}
window.wrBell=function(){try{bell(false)}catch(e){}};
setInterval(function(){try{badge(split())}catch(e){}},15000);
/* ---- Inactividad, atajos y subir ---- */
var idleT=null;function armIdle(){clearTimeout(idleT);var m=+pref('idle','0');if(m&&typeof currentUser!=='undefined'&&currentUser)idleT=setTimeout(function(){toast('Sesión cerrada por inactividad');setTimeout(function(){logout()},800)},m*60000)}
['click','keydown','mousemove','touchstart'].forEach(function(ev){document.addEventListener(ev,function(){if(idleT)armIdle()},{passive:true})});
document.addEventListener('keydown',function(e){var t=e.target,typing=t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||(t&&t.isContentEditable);
  if(e.altKey&&/^Digit[1-9]$/.test(e.code)){collect();var it=items[+e.code.slice(5)-1];if(it&&currentUser){e.preventDefault();it.f()}}
  else if(e.altKey&&e.code==='KeyT'){e.preventDefault();toggleTheme()}
  else if(e.key==='?'&&!typing&&!e.ctrlKey&&typeof currentUser!=='undefined'&&currentUser)showHelp();
  else if(e.key==='Escape'){var m=$('#wr-modal');if(m)m.classList.remove('open')}});
var tb=document.createElement('button');tb.id='wr-top';tb.className='no-print';tb.setAttribute('aria-label','Subir');tb.innerHTML='<i class="fas fa-arrow-up"></i>';tb.onclick=function(){window.scrollTo({top:0,behavior:'smooth'});var c=$('#content');if(c)c.scrollTo&&c.scrollTo({top:0,behavior:'smooth'})};document.body.appendChild(tb);
window.addEventListener('scroll',function(){tb.style.display=window.scrollY>400?'block':'none'},{passive:true});
applyPrefs();window.wrApplyPrefs=applyPrefs;
buildTools();
if('serviceWorker' in navigator&&/^https?:/.test(location.protocol))navigator.serviceWorker.register('sw.js').then(function(r){r.addEventListener('updatefound',function(){var w=r.installing;w&&w.addEventListener('statechange',function(){if(w.state==='installed'&&navigator.serviceWorker.controller)toast('Hay una nueva versión disponible: recarga con Ctrl+F5')})})}).catch(function(){});
})();
