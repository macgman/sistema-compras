/* ===== MÓDULOS NUEVOS: Stock mínimo · Proveedores y órdenes · Seguridad (no modifican el código original) ===== */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var E=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var T=function(m,t){if(typeof showToast==='function')showToast(m,t)};
var hasPerm=function(k){try{return typeof window.userHasPermission==='function'&&window.userHasPermission(k)}catch(e){return false}};
var isAdmin=function(){return hasPerm('users.manage')};
var money=function(n){return '$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})};
/* ---------- Almacén compartido en Firebase (compraPro/ext/<sala>/...) con copia local ---------- */
var ext={stockMin:{},prov:{},oc:{},cfg:{}},on=false,NAMES=['stockMin','prov','oc','cfg'];
function room(){try{return String(getFirebaseRoomPath()).split('/').pop()}catch(e){return''}}
function lk(n){return 'wr-ext-'+room()+'-'+n}
function load(){NAMES.forEach(function(n){try{ext[n]=JSON.parse(localStorage.getItem(lk(n))||'{}')||{}}catch(e){}})}
function ref(n){return firebaseDB.ref('compraPro/ext/'+room()+'/'+n)}
function listen(){if(on||!room())return;try{if(!firebaseReady||!firebaseDB)return}catch(e){return}
  on=true;load();NAMES.forEach(function(n){ref(n).on('value',function(s){ext[n]=s.val()||{};try{localStorage.setItem(lk(n),JSON.stringify(ext[n]))}catch(e){}refresh()},function(){T('Sin permiso para leer '+n+'. Revisa las reglas de Firebase.','error')})})}
function put(n,id,v){var c=v===null?null:JSON.parse(JSON.stringify(v));if(c===null)delete ext[n][id];else ext[n][id]=c;
  try{localStorage.setItem(lk(n),JSON.stringify(ext[n]))}catch(e){}
  try{if(firebaseReady&&firebaseDB)ref(n).child(id).set(c).catch(function(){T('No se pudo guardar en la nube (¿sin permiso o sin conexión?)','error')})}catch(e){}refresh()}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
/* ---------- Secciones y menú ---------- */
function mkSection(id,html){var c=$('#content');if(!c||$('#section-'+id))return;var d=document.createElement('div');d.id='section-'+id;d.className='section';d.style.display='none';d.innerHTML=html;c.appendChild(d)}
function mkNav(){var nav=$('#sidebar nav');if(!nav||$('#nav-stock-minimo'))return;
  var h='<div class="nav-group">Gestión</div>'+
   '<a onclick="showSection(\'stock-minimo\')" id="nav-stock-minimo"><i class="fas fa-bell"></i><span>Stock mínimo</span></a>'+
   '<a onclick="showSection(\'ordenes\')" id="nav-ordenes"><i class="fas fa-file-invoice"></i><span>Órdenes de compra</span></a>'+
   '<a onclick="showSection(\'seguridad\')" id="nav-seguridad" data-permission="users.manage"><i class="fas fa-shield-halved"></i><span>Seguridad</span></a>';
  nav.insertAdjacentHTML('beforeend',h)}
var TITLES={'stock-minimo':'Stock mínimo','ordenes':'Órdenes de compra','seguridad':'Seguridad'};
var origShow=window.showSection;
window.showSection=function(n){var r=origShow.apply(this,arguments);if(TITLES[n]){var t=$('#page-title');if(t)t.textContent=TITLES[n].toUpperCase();render(n)}return r};
function refresh(){['stock-minimo','ordenes','seguridad'].forEach(function(n){var s=$('#section-'+n);if(s&&s.style.display==='block'&&!(document.activeElement&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)))render(n)});if(typeof window.wrBell==='function')window.wrBell()}
function render(n){if(n==='stock-minimo')rStock();else if(n==='ordenes')rOrd();else if(n==='seguridad')rSec()}
function card(t,s){return '<div class="net-box" style="margin-bottom:14px"><div class="net-box-title">'+t+'</div>'+(s?'<div class="net-box-sub">'+s+'</div>':'')+'</div>'}
/* ---------- 2) STOCK MÍNIMO + ALERTAS ---------- */
window.wrMin=function(p){var v=ext.stockMin[p.id!=null?p.id:p.clave];return v!=null&&v!==''?Number(v):5};
function pk(p){return String(p.id!=null?p.id:p.clave)}
// Permite configurar el mínimo desde el formulario Gestionar material,
// reutilizando el mismo almacenamiento sincronizado de la sección Stock mínimo.
window.wrSetMin=function(p,value){
  if(!p)return;
  var v=Number(value);
  if(!Number.isInteger(v)||v<0)return;
  put('stockMin',pk(p),v);
};
var sq='',sf='todos';
function rStock(){var s=$('#section-stock-minimo');var P=(typeof products!=='undefined'?products:[]);var low=P.filter(function(p){return(Number(p.cantidad)||0)<=window.wrMin(p)});
  var c=ext.cfg.alert||{};
  s.innerHTML=card('<i class="fas fa-bell" style="color:#ef4444"></i> Stock mínimo por material','Cada material puede tener su propio punto de reorden (por omisión 5). Las alertas y la campana usan este valor. Se comparte entre todas las computadoras.')+
  '<div class="net-box" style="margin-bottom:14px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">'+
   '<div class="form-group" style="flex:1;min-width:200px"><label>Correo para alertas</label><input id="al-mail" type="email" value="'+E(c.mail)+'" placeholder="compras@empresa.com"></div>'+
   '<div class="form-group" style="flex:1;min-width:200px"><label>WhatsApp (con lada, solo números)</label><input id="al-wa" value="'+E(c.wa)+'" placeholder="5219991234567"></div>'+
   '<button class="btn btn-outline" id="al-save"><i class="fas fa-floppy-disk"></i> Guardar</button>'+
   '<button class="btn btn-primary" id="al-mailgo"><i class="fas fa-envelope"></i> Enviar por correo</button>'+
   '<button class="btn btn-primary" id="al-wago" style="background:#16a34a"><i class="fab fa-whatsapp"></i> Enviar por WhatsApp</button><button class="btn btn-outline" id="al-oc"><i class="fas fa-file-invoice"></i> Crear orden de compra</button></div>'+
   '<div class="net-box-sub" style="margin-top:8px">'+low.length+' materiales están en o bajo su mínimo. Los botones abren tu correo o WhatsApp con el mensaje listo; el envío automático sin abrir nada requiere un servidor.</div></div>'+
  '<div class="toolbar" style="gap:8px;flex-wrap:wrap"><div class="search-box" style="flex:2;min-width:220px"><i class="fas fa-search"></i><input id="sm-q" value="'+E(sq)+'" placeholder="Buscar material o clave..."></div>'+
   '<select id="sm-f"><option value="todos">Todos</option><option value="bajo">Solo bajo mínimo</option><option value="def">Con mínimo definido</option></select></div>'+
  '<div class="table-wrap"><table><thead><tr><th>Clave</th><th>Descripción</th><th>Stock</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody id="sm-body"></tbody></table></div><div id="sm-more" style="padding:10px;text-align:center"></div>';
  $('#sm-f').value=sf;
  var q=sq.toLowerCase(),rows=P.filter(function(p){var m=window.wrMin(p),b=(Number(p.cantidad)||0)<=m;if(sf==='bajo'&&!b)return false;if(sf==='def'&&ext.stockMin[pk(p)]==null)return false;return !q||((p.clave||'')+' '+(p.descripcion||'')).toLowerCase().indexOf(q)>-1});
  rows.sort(function(a,b){return((Number(a.cantidad)||0)-window.wrMin(a))-((Number(b.cantidad)||0)-window.wrMin(b))});
  $('#sm-body').innerHTML=rows.slice(0,100).map(function(p){var q2=Number(p.cantidad)||0,m=window.wrMin(p),b=q2<=m;
    return '<tr><td>'+E(p.clave)+'</td><td>'+E(p.descripcion)+'</td><td><b>'+q2+'</b></td><td><input type="number" min="0" class="sm-in" data-k="'+E(pk(p))+'" value="'+m+'" style="width:80px"></td><td><span style="font-weight:800;color:'+(b?'#ef4444':'#059669')+'">'+(b?'Reabastecer':'OK')+'</span></td></tr>'}).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px">Sin resultados</td></tr>';
  if(rows.length>100)$('#sm-more').textContent='Mostrando 100 de '+rows.length+'. Usa la búsqueda para afinar.';
  $('#sm-q').oninput=function(){sq=this.value;rStock();var i=$('#sm-q');i.focus();i.setSelectionRange(sq.length,sq.length)};$('#sm-f').onchange=function(){sf=this.value;rStock()};
  Array.prototype.forEach.call(document.querySelectorAll('.sm-in'),function(i){i.onchange=function(){var v=this.value===''?null:Math.max(0,Math.floor(Number(this.value)));if(v===null)put('stockMin',this.dataset.k,null);else put('stockMin',this.dataset.k,v);T('Mínimo guardado')}});
  $('#al-oc').onclick=function(){window.showSection('ordenes');setTimeout(function(){editOC(null,true)},100)};
  $('#al-save').onclick=function(){put('cfg','alert',{mail:$('#al-mail').value.trim(),wa:$('#al-wa').value.replace(/\D/g,'')});T('Destinatarios guardados')};
  function msg(){var L=low.slice(0,40).map(function(p){return '• '+String(p.descripcion||p.clave).slice(0,70)+' — stock '+(Number(p.cantidad)||0)+' (mín. '+window.wrMin(p)+')'});return 'ALERTA DE STOCK · COMPRA ('+new Date().toLocaleDateString('es-MX')+')\n'+low.length+' materiales en o bajo su mínimo:\n'+L.join('\n')+(low.length>40?'\n… y '+(low.length-40)+' más.':'')}
  $('#al-mailgo').onclick=function(){var m=$('#al-mail').value.trim();location.href='mailto:'+encodeURIComponent(m)+'?subject='+encodeURIComponent('Alerta de stock mínimo')+'&body='+encodeURIComponent(msg())};
  $('#al-wago').onclick=function(){var w=$('#al-wa').value.replace(/\D/g,'');window.open('https://wa.me/'+w+'?text='+encodeURIComponent(msg()),'_blank','noopener')}}
/* ---------- 3) PROVEEDORES Y ÓRDENES DE COMPRA (con recepciones) ---------- */
var tab='oc',fl={q:'',e:'',p:''};
var ST=['Borrador','Pendiente','Aprobada','Enviada','Entrega parcial','Recibida','Cancelada'];
var COL={Borrador:'#6b7280',Pendiente:'#f59e0b',Aprobada:'#2563eb',Enviada:'#7c3aed','Entrega parcial':'#ea580c',Recibida:'#059669',Cancelada:'#9ca3af'};
var OPEN=['Aprobada','Enviada','Entrega parcial'],today=function(){return new Date().toISOString().slice(0,10)};
function mo(title,body,w){var m=$('#wr-mod2');if(!m){m=document.createElement('div');m.id='wr-mod2';m.className='modal-overlay';document.body.appendChild(m)}
  m.innerHTML='<div class="modal" style="max-width:'+(w||760)+'px;max-height:92vh;overflow:auto"><div class="modal-header"><h3>'+title+'</h3><button class="close-btn" id="mo-x">&times;</button></div>'+body+'</div>';m.classList.add('open');$('#mo-x').onclick=function(){m.classList.remove('open')};return m}
function F(l,h,s){return '<div class="form-group"'+(s?' style="'+s+'"':'')+'><label>'+l+'</label>'+h+'</div>'}
function norm(o){o=JSON.parse(JSON.stringify(o));o.nombre=String(o.nombre||'');o.items=o.items||[];o.items.forEach(function(i){if(i.rec==null)i.rec=o.estado==='Recibida'?i.cant:0});o.adjs=o.adjs||(o.adj?[o.adj]:[]);delete o.adj;o.recs=o.recs||[];o.log=o.log||[];if(o.iva==null)o.iva=0;return o}
function findP(i){var P=typeof products!=='undefined'?products:[];return P.filter(function(p){return String(p.id)===String(i.pid)})[0]||P.filter(function(p){return i.clave&&p.clave&&p.clave!=='N/A'&&String(p.clave)===String(i.clave)})[0]}
function ingresar(o,rc,upd){
  if(typeof addMov!=='function'||typeof products==='undefined')return{ok:false,err:'El módulo de inventario no está disponible'};
  if(!hasPerm('purchases.edit')||!hasPerm('inventory.edit'))return{ok:false,err:'Se requieren permisos para modificar compras e inventario'};
  var n=0,miss=[],plan=[],tag='OC-'+('000'+o.num).slice(-4);
  o.items.forEach(function(i,k){var q=Number(rc.items&&rc.items['i'+k])||0;if(q<=0)return;var p=findP(i);if(!p)miss.push(i.desc);else plan.push([p,i,q])});
  if(!plan.length)return{ok:false,err:'Los materiales de esta recepción no se encontraron en el catálogo'};
  try{plan.forEach(function(x){var p=x[0],i=x[1],q=x[2];p.cantidad=(Number(p.cantidad)||0)+q;if(upd)p.precio=Number(i.precio)||0;if(rc.doc)p.factura=rc.doc;p.fecha_entrada=rc.fecha||today();p.updatedAt=Date.now();
      addMov('ENTRADA',p.id,q,'Recepción '+tag+(rc.doc?' · doc '+rc.doc:'')+(rc.nota?' · '+rc.nota:''),rc.doc||tag,'',{fecha_factura:rc.fecha||today(),unitCost:Number(i.precio)||0});n+=q})}
  catch(e){return{ok:false,err:'Error al registrar la entrada ('+e.message+'). Revisa el Kardex antes de reintentar.'}}
  try{broadcastFullSync()}catch(e){}
  ['renderInventario','renderDashboard','renderMovimientos','renderKardex'].forEach(function(f){try{if(typeof window[f]==='function')window[f]()}catch(e){}});
  if(miss.length)T('Sin entrada (no está en el catálogo): '+miss.join(', '),'error');
  return{ok:true,n:n}}
function invTag(r){var ad=hasPerm('purchases.edit')&&hasPerm('inventory.edit');
  if(r.anulada)return ' · <b style="color:#6b7280">ANULADA</b> <small>('+E(r.anulada.motivo)+' · '+E(r.anulada.by)+')</small>';
  var s;if(r.inv&&r.inv.done)s=' · <b style="color:#059669">✓ En inventario</b>';else{var leg=r.inv===undefined;s=' · <b style="color:#ea580c">'+(leg?'Sin inventariar (anterior)':'⏳ Pendiente de inventariar')+'</b>'+(ad?' <button class="btn btn-outline rc-inv" data-id="'+r.id+'" style="padding:1px 8px">Dar entrada</button>':'')}
  return s+(ad?' <button class="btn btn-outline rc-an" data-id="'+r.id+'" style="padding:1px 8px;color:#ef4444">Anular</button>':'')}
function revertir(o,rc,mot){
  if(typeof addMov!=='function'||typeof products==='undefined')return{ok:false,err:'El módulo de inventario no está disponible'};
  if(!hasPerm('purchases.edit')||!hasPerm('inventory.edit'))return{ok:false,err:'Se requieren permisos para modificar compras e inventario'};
  var tag='OC-'+('000'+o.num).slice(-4),plan=[],low=[],n=0;
  o.items.forEach(function(i,k){var q=Number(rc.items&&rc.items['i'+k])||0;if(q<=0)return;var p=findP(i);if(!p)return;var st=Number(p.cantidad)||0;if(st<q)low.push(String(p.descripcion||p.clave).slice(0,40)+' (stock '+st+', a revertir '+q+')');else plan.push([p,q])});
  if(low.length)return{ok:false,err:'No se puede anular: el stock actual es menor a lo recibido en '+low.join('; ')+'. Ese material ya tuvo salidas; corrige primero con un ajuste en Kardex.'};
  if(!plan.length)return{ok:false,err:'Los materiales de esta recepción no se encontraron en el catálogo'};
  try{plan.forEach(function(x){var p=x[0],q=x[1],before=Number(p.cantidad)||0;p.cantidad=before-q;p.updatedAt=Date.now();
      addMov('SALIDA',p.id,q,'ANULACIÓN de recepción '+tag+(rc.doc?' · doc '+rc.doc:'')+': '+mot,'ANUL-'+tag,'',{stockBefore:before,kardexSource:'ANULACION_RECEPCION'});n+=q})}
  catch(e){return{ok:false,err:'Error al revertir ('+e.message+'). Revisa el Kardex antes de reintentar.'}}
  try{broadcastFullSync()}catch(e){}
  ['renderInventario','renderDashboard','renderMovimientos','renderKardex'].forEach(function(f){try{if(typeof window[f]==='function')window[f]()}catch(e){}});
  return{ok:true,n:n}}
function restate(o){if(['Recibida','Entrega parcial'].indexOf(o.estado)<0)return;var full=o.items.every(function(i){return(Number(i.rec)||0)>=(Number(i.cant)||0)}),any=o.items.some(function(i){return(Number(i.rec)||0)>0});o.estado=full?'Recibida':any?'Entrega parcial':'Enviada'}
function allOC(){return Object.keys(ext.oc).map(function(k){return norm(ext.oc[k])})}
function sub(o){return o.items.reduce(function(a,i){return a+(Number(i.cant)||0)*(Number(i.precio)||0)},0)}
function totO(o){return sub(o)*(1+(Number(o.iva)||0)/100)}
function pct(o){var a=0,b=0,qa=0,qb=0;o.items.forEach(function(i){var c=Number(i.cant)||0,r=Math.min(Number(i.rec)||0,c),p=Number(i.precio)||0;a+=r*p;b+=c*p;qa+=r;qb+=c});return b>0?Math.round(a/b*100):(qb?Math.round(qa/qb*100):0)}
function late(o){return !!o.entrega&&OPEN.indexOf(o.estado)>-1&&o.entrega<today()}
function who(){return currentUser.name||currentUser.username||''}
function logE(o,ev){o.log.push({t:new Date().toISOString(),por:who(),ev:ev})}
function letras(n){n=Math.round(n*100)/100;var e=Math.floor(n),c=Math.round((n-e)*100);
  var U=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'],D=['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'],C=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
  function ap(s){return s.replace(/veintiuno$/,'veintiún').replace(/uno$/,'un')}
  function b100(x){if(x<30)return U[x];var d=Math.floor(x/10),u=x%10;return D[d]+(u?' y '+U[u]:'')}
  function b1000(x){if(x===100)return 'cien';var c2=Math.floor(x/100),r=x%100;return (C[c2]+' '+(r?b100(r):'')).trim()}
  function g(x){if(x===0)return 'cero';var m=Math.floor(x/1e6),k=Math.floor(x%1e6/1000),r=x%1000,s='';if(m)s+=(m===1?'un millón':ap(g(m))+' millones')+' ';if(k)s+=(k===1?'mil':ap(b1000(k))+' mil')+' ';if(r)s+=b1000(r);return s.trim()}
  var t=e===1?'un peso':g(e)+(e%1e6===0&&e>0?' de pesos':' pesos');return (t+' '+('0'+c).slice(-2)+'/100 M.N.').replace(/^./,function(x){return x.toUpperCase()})}
function dl(blob,name){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},800)}
function badge2(o){return '<span style="font-weight:800;color:'+COL[o.estado]+'">'+o.estado+'</span>'+(late(o)?' <span style="background:#fee2e2;color:#b91c1c;border-radius:99px;padding:1px 8px;font:800 .65rem system-ui">ATRASADA</span>':'')}
function rOrd(){var s=$('#section-ordenes');
  s.innerHTML=card('<i class="fas fa-file-invoice" style="color:#059669"></i> Proveedores y órdenes de compra','Flujo: Borrador → Pendiente → Aprobada (admin) → Enviada → Entrega parcial / Recibida. Cada recepción queda registrada con fecha, documento y responsable. Al recibir, un administrador puede dar entrada automática al inventario y al Kardex.')+
  '<div class="toolbar" style="gap:8px;flex-wrap:wrap"><button class="btn '+(tab==='oc'?'btn-primary':'btn-outline')+'" id="t-oc">Órdenes</button><button class="btn '+(tab==='pv'?'btn-primary':'btn-outline')+'" id="t-pv">Proveedores</button><span style="flex:1"></span>'+(tab==='oc'?'<button class="btn btn-outline" id="t-xl"><i class="fas fa-file-excel"></i> Excel</button>':'')+'<button class="btn btn-primary" id="t-new"><i class="fas fa-plus"></i> '+(tab==='oc'?'Nueva orden':'Nuevo proveedor')+'</button></div><div id="ord-k"></div><div class="table-wrap" id="ord-t"></div>';
  $('#t-oc').onclick=function(){tab='oc';rOrd()};$('#t-pv').onclick=function(){tab='pv';rOrd()};$('#t-new').style.display=(tab==='oc'?hasPerm('purchases.create'):(hasPerm('purchases.create')||hasPerm('purchases.edit')))?'inline-flex':'none';
   $('#t-new').onclick=function(){tab==='oc'?editOC():editPV()};
  if(tab==='pv'){var V=Object.keys(ext.prov).map(function(k){return ext.prov[k]});
    $('#ord-t').innerHTML='<table><thead><tr><th>Proveedor</th><th>RFC</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th></th></tr></thead><tbody>'+(V.map(function(v){return '<tr><td><b>'+E(v.nombre)+'</b></td><td>'+E(v.rfc)+'</td><td>'+E(v.contacto)+'</td><td>'+E(v.tel)+'</td><td>'+E(v.mail)+'</td><td><button class="btn btn-outline" data-pv="'+v.id+'"><i class="fas fa-pen"></i></button></td></tr>'}).join('')||'<tr><td colspan="6" style="text-align:center;padding:20px">Aún no hay proveedores</td></tr>')+'</tbody></table>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-pv]'),function(b){b.onclick=function(){editPV(ext.prov[this.dataset.pv])}});return}
  var A=allOC(),mes=today().slice(0,7);
  var por=A.filter(function(o){return o.estado==='Pendiente'}).length,proc=A.filter(function(o){return OPEN.indexOf(o.estado)>-1}),pend=proc.reduce(function(a,o){return a+totO(o)*(100-pct(o))/100},0),atr=A.filter(late).length,rec=A.filter(function(o){return o.estado==='Recibida'&&(o.log.slice(-1)[0]||{t:''}).t.slice(0,7)===mes||o.estado==='Recibida'&&!o.log.length}).length;
  function k(l,v,c){return '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px"><small style="color:var(--text-light)">'+l+'</small><div style="font-size:1.25rem;font-weight:800;color:'+(c||'var(--text)')+'">'+v+'</div></div>'}
  $('#ord-k').innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0">'+k('Por aprobar',por,'#f59e0b')+k('En proceso',proc.length,'#2563eb')+k('Monto por recibir',money(pend))+k('Atrasadas',atr,atr?'#ef4444':'')+k('Recibidas',rec,'#059669')+'</div>'+
   '<div class="toolbar" style="gap:8px;flex-wrap:wrap"><div class="search-box" style="flex:2;min-width:200px"><i class="fas fa-search"></i><input id="f-q" value="'+E(fl.q)+'" placeholder="Buscar No. de orden o proveedor..."></div><select id="f-e"><option value="">Todos los estados</option>'+ST.map(function(e){return '<option'+(fl.e===e?' selected':'')+'>'+e+'</option>'}).join('')+'</select><select id="f-p"><option value="">Todos los proveedores</option>'+Object.keys(ext.prov).map(function(p){return '<option value="'+p+'"'+(fl.p===p?' selected':'')+'>'+E(ext.prov[p].nombre)+'</option>'}).join('')+'</select></div>';
  $('#f-q').oninput=function(){fl.q=this.value;drawT()};$('#f-e').onchange=function(){fl.e=this.value;drawT()};$('#f-p').onchange=function(){fl.p=this.value;drawT()};
  $('#t-xl').style.display=hasPerm('reports.export')?'inline-flex':'none';$('#t-xl').onclick=function(){xls(A)};drawT();
  function drawT(){var q=fl.q.toLowerCase(),R=A.filter(function(o){var n='oc-'+('000'+o.num).slice(-4),pn=(ext.prov[o.prov]||{}).nombre||'',nm=o.nombre||'';return(!fl.e||o.estado===fl.e)&&(!fl.p||o.prov===fl.p)&&(!q||(n+' '+pn+' '+nm).toLowerCase().indexOf(q)>-1)}).sort(function(a,b){return b.num-a.num});
    $('#ord-t').innerHTML='<table><thead><tr><th>No.</th><th>Nombre de la orden</th><th>Fecha</th><th>Entrega</th><th>Proveedor</th><th>Total</th><th>Avance</th><th>Estado</th><th></th></tr></thead><tbody>'+(R.map(function(o){var p=pct(o);return '<tr><td><b>OC-'+('000'+o.num).slice(-4)+'</b></td><td>'+E(o.nombre||'—')+'</td><td>'+E(o.fecha)+'</td><td>'+E(o.entrega||'—')+'</td><td>'+E((ext.prov[o.prov]||{}).nombre||'—')+'</td><td>'+money(totO(o))+'</td><td style="min-width:110px"><div style="height:8px;background:var(--bg);border-radius:9px;overflow:hidden"><i style="display:block;height:100%;width:'+p+'%;background:#059669"></i></div><small>'+p+'%</small></td><td>'+badge2(o)+'</td><td><button class="btn btn-outline" data-oc="'+o.id+'"><i class="fas fa-eye"></i></button></td></tr>'}).join('')||'<tr><td colspan="9" style="text-align:center;padding:20px">Sin órdenes con estos filtros</td></tr>')+'</tbody></table>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-oc]'),function(b){b.onclick=function(){editOC(ext.oc[this.dataset.oc])}})}}
function xls(A){if(!hasPerm('reports.export')){T('No tienes permiso para exportar reportes','error');return}if(typeof ExcelJS==='undefined'){T('El módulo de Excel aún no carga; reintenta','error');return}
  var wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Órdenes de compra');ws.columns=[['No.',12],['Nombre de la orden',32],['Fecha',12],['Entrega',12],['Proveedor',34],['Estado',16],['Subtotal',14],['IVA %',8],['Total',14],['Avance %',10]].map(function(c){return{header:c[0],width:c[1]}});
  A.sort(function(a,b){return a.num-b.num}).forEach(function(o){ws.addRow(['OC-'+('000'+o.num).slice(-4),o.nombre||'',o.fecha,o.entrega||'',(ext.prov[o.prov]||{}).nombre||'',o.estado,sub(o),Number(o.iva)||0,totO(o),pct(o)])});ws.getRow(1).font={bold:true};
  wb.xlsx.writeBuffer().then(function(b){dl(new Blob([b],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'ordenes-compra-'+today()+'.xlsx');T('Excel generado')})}
function editPV(v){if(!hasPerm('purchases.create')&&!hasPerm('purchases.edit')){T('No tienes permiso para gestionar proveedores','error');return}v=v||{id:uid()};var m=mo('Proveedor','<div class="form-grid" style="grid-template-columns:1fr 1fr">'+F('Nombre / Razón social','<input id="pv-n" value="'+E(v.nombre)+'">')+F('RFC','<input id="pv-r" value="'+E(v.rfc)+'">')+F('Contacto','<input id="pv-c" value="'+E(v.contacto)+'">')+F('Teléfono','<input id="pv-t" value="'+E(v.tel)+'">')+F('Correo','<input id="pv-m" value="'+E(v.mail)+'">','grid-column:1/-1')+'</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'+(v.nombre?'<button class="btn btn-outline" id="pv-d" style="color:#ef4444">Eliminar</button>':'')+'<button class="btn btn-primary" id="pv-s">Guardar</button></div>',560);
  $('#pv-s').onclick=function(){var n=$('#pv-n').value.trim();if(!n){T('Escribe el nombre del proveedor','error');return}put('prov',v.id,{id:v.id,nombre:n,rfc:$('#pv-r').value.trim().toUpperCase(),contacto:$('#pv-c').value.trim(),tel:$('#pv-t').value.trim(),mail:$('#pv-m').value.trim()});m.classList.remove('open');T('Proveedor guardado')};
  var d=$('#pv-d');if(d){d.style.display=hasPerm('purchases.delete')?'inline-flex':'none';d.onclick=function(){if(!hasPerm('purchases.delete')){T('No tienes permiso para eliminar proveedores','error');return}if(confirm('¿Eliminar este proveedor?')){put('prov',v.id,null);m.classList.remove('open')}}}}
function nextNum(){return Math.max.apply(null,[0].concat(Object.keys(ext.oc).map(function(k){return ext.oc[k].num||0})))+1}
function editOC(o0,dup){var nuevo=!o0||dup;if(nuevo&&!hasPerm('purchases.create')){T('No tienes permiso para crear órdenes de compra','error');return}if(!nuevo&&!hasPerm('purchases.view')&&!hasPerm('purchases.edit')&&!hasPerm('purchases.delete')){T('No tienes permiso para consultar órdenes','error');return}var o=o0?norm(o0):{id:uid(),num:nextNum(),fecha:today(),entrega:'',estado:'Borrador',items:[],notas:'',iva:16,prioridad:'Normal',pago:'Contado',solicitante:who(),area:'',lugar:'',adjs:[],recs:[],log:[]};
  if(dup){o.id=uid();o.num=nextNum();o.nombre=o.nombre?o.nombre+' (copia)':'';o.fecha=today();o.estado='Borrador';o.recs=[];o.log=[];o.adjs=[];delete o.aprobo;delete o.aprobadaEl;delete o.motivo;o.items.forEach(function(i){i.rec=0})}
  var P=typeof products!=='undefined'?products:[],adm=nuevo?hasPerm('purchases.create'):hasPerm('purchases.edit'),canDelete=hasPerm('purchases.delete'),canReceive=hasPerm('purchases.edit')&&hasPerm('inventory.edit');
  function lockedF(){return ['Borrador','Pendiente'].indexOf(o.estado)<0}
  function body(){var L=lockedF(),d=(L||!adm)?' disabled':'';
    var opts=Object.keys(ext.prov).map(function(k){return '<option value="'+k+'"'+(o.prov===k?' selected':'')+'>'+E(ext.prov[k].nombre)+'</option>'}).join('');
    function sel(id,arr,v){return '<select id="'+id+'"'+d+'>'+arr.map(function(x){return '<option'+(String(v)===String(x)?' selected':'')+'>'+x+'</option>'}).join('')+'</select>'}
    var h='<div style="margin:-6px 0 10px">'+badge2(o)+(o.aprobo?' · Aprobó: <b>'+E(o.aprobo)+'</b>':'')+(o.motivo?' · Motivo: '+E(o.motivo):'')+'</div>'+
     '<div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">'+F('Nombre de la orden','<input id="oc-nombre" maxlength="120" value="'+E(o.nombre||'')+'" placeholder="Ej. Compra de material de oficina"'+d+'>','grid-column:1/-1')+F('Proveedor','<select id="oc-p"'+d+'><option value="">— elegir —</option>'+opts+'</select>')+F('Fecha de la orden','<input type="date" id="oc-f" value="'+E(o.fecha)+'"'+d+'>')+F('Entrega requerida','<input type="date" id="oc-en" value="'+E(o.entrega)+'"'+d+'>')+F('Solicitante','<input id="oc-so" value="'+E(o.solicitante)+'"'+d+'>')+F('Área / Partida presupuestal','<input id="oc-ar" value="'+E(o.area)+'"'+d+'>')+F('Prioridad',sel('oc-pr',['Normal','Urgente'],o.prioridad))+F('Condiciones de pago',sel('oc-pg',['Contado','Crédito 15 días','Crédito 30 días','Crédito 45 días','Crédito 60 días'],o.pago))+F('IVA %',sel('oc-iv',[0,8,16],o.iva))+F('Lugar de entrega','<input id="oc-lu" value="'+E(o.lugar)+'"'+d+'>')+'</div>';
    if(!L&&adm)h+=F('Agregar material','<input id="oc-s" list="oc-dl" placeholder="Escribe clave o descripción y elige..."><datalist id="oc-dl">'+P.slice(0,3000).map(function(p,i){return '<option value="'+i+' · '+E(String(p.descripcion||p.clave).slice(0,80))+'">'}).join('')+'</datalist>','margin-top:8px');
    h+='<div style="overflow:auto"><table style="width:100%;margin-top:8px"><thead><tr><th>Material</th><th>Unidad</th><th>Pedido</th><th>Recibido</th><th>Pend.</th><th>Precio</th><th>Importe</th>'+((L||!adm)?'':'<th></th>')+'</tr></thead><tbody>'+o.items.map(function(i,k){var pe=Math.max(0,(Number(i.cant)||0)-(Number(i.rec)||0));return '<tr><td>'+E(i.desc)+'</td><td>'+E(i.unidad||'')+'</td><td>'+((L||!adm)?i.cant:'<input type="number" min="1" class="oi" data-k="'+k+'" data-f="cant" value="'+i.cant+'" style="width:70px">')+'</td><td style="color:#059669;font-weight:800">'+(Number(i.rec)||0)+'</td><td style="color:'+(pe?'#ea580c':'#059669')+';font-weight:800">'+pe+'</td><td>'+((L||!adm)?money(i.precio):'<input type="number" min="0" step="0.01" class="oi" data-k="'+k+'" data-f="precio" value="'+i.precio+'" style="width:90px">')+'</td><td>'+money((i.cant||0)*(i.precio||0))+'</td>'+((L||!adm)?'':'<td><button class="btn btn-outline oi-d" data-k="'+k+'">&times;</button></td>')+'</tr>'}).join('')+'</tbody></table></div>'+
     '<div style="text-align:right;margin:10px 0;line-height:1.6">Subtotal: '+money(sub(o))+'<br>IVA '+(Number(o.iva)||0)+'%: '+money(sub(o)*(Number(o.iva)||0)/100)+'<br><b style="font-size:1.1rem">Total: '+money(totO(o))+'</b><br><small style="color:var(--text-light)">'+letras(totO(o))+'</small></div>'+
     F('Notas / instrucciones al proveedor','<input id="oc-n" value="'+E(o.notas)+'"'+d+'>');
    h+='<div class="form-group" style="margin-top:8px"><label>Adjuntos (cotización, factura, remisión · máx. 3 archivos de 1 MB)</label>'+o.adjs.map(function(a,i){return '<div>📎 <a href="#" class="ad-dl" data-i="'+i+'">'+E(a.name)+'</a> <button class="btn btn-outline ad-x" data-i="'+i+'">Quitar</button></div>'}).join('')+(o.adjs.length<3?'<input type="file" id="oc-fl" accept=".pdf,.png,.jpg,.jpeg,.xlsx">':'')+'</div>';
    if(o.recs.length)h+='<div class="form-group"><label>Recepciones registradas <small style="font-weight:400">(para corregir una: anúlala y registra la correcta)</small></label>'+o.recs.map(function(r){var n=0;o.items.forEach(function(i,k){n+=Number(r.items&&r.items['i'+k])||0});return '<div style="font-size:.82rem;padding:4px 0;border-bottom:1px solid var(--border)'+(r.anulada?';opacity:.6':'')+'">'+E(r.fecha)+' · <b>'+n+'</b> pzas · Doc: '+E(r.doc||'—')+' · Recibió: '+E(r.por)+(r.nota?' · '+E(r.nota):'')+invTag(r)+'</div>'}).join('')+'</div>';
    if(o.log.length)h+='<details style="margin-top:6px"><summary style="cursor:pointer;font-size:.82rem">Bitácora ('+o.log.length+')</summary>'+o.log.map(function(l){return '<div style="font-size:.78rem;color:var(--text-light)">'+E(l.t.slice(0,16).replace('T',' '))+' · '+E(l.por)+' · '+E(l.ev)+'</div>'}).join('')+'</details>';
    var b=function(id,t,c){return '<button class="btn '+(c||'btn-outline')+'" id="'+id+'">'+t+'</button>'},e=o.estado;
     h+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">'+(hasPerm('purchases.create')&&!nuevo?b('oc-dup','<i class="fas fa-copy"></i> Duplicar'):'')+(!nuevo&&hasPerm('reports.export')?b('oc-pr','<i class="fas fa-print"></i> Imprimir'):'')+
      (canDelete&&(e==='Borrador'||e==='Cancelada')&&!nuevo?b('oc-del','Eliminar'):'')+(adm&&e!=='Recibida'&&e!=='Cancelada'&&!nuevo?b('oc-can','Cancelar orden'):'')+
      (adm&&(e==='Enviada'||e==='Entrega parcial')?b('oc-cl','Cerrar con faltantes'):'')+(adm&&e==='Pendiente'?b('oc-ret','Devolver a borrador'):'')+
      (adm&&e==='Borrador'?b('oc-sv','Guardar borrador')+b('oc-ap0','Enviar a aprobación','btn-primary'):'')+(adm&&e==='Pendiente'?b('oc-sv','Guardar cambios')+b('oc-ap','Aprobar','btn-primary'):'')+
      (adm&&e==='Aprobada'?b('oc-sv','Guardar')+b('oc-en2','Marcar enviada al proveedor','btn-primary'):'')+(['Aprobada','Enviada','Entrega parcial'].indexOf(e)>-1&&canReceive?b('oc-rc','<i class="fas fa-truck-ramp-box"></i> Registrar recepción','btn-primary'):'')+(adm&&(e==='Enviada'||e==='Entrega parcial')?b('oc-sv','Guardar'):'')+(adm&&(e==='Recibida'||e==='Cancelada')?b('oc-sv','Guardar notas/adjuntos'):'')+'</div>';
    return h}
  var m=mo((o.nombre?E(o.nombre):(nuevo?'Nueva orden':'Orden de compra'))+' · OC-'+('000'+o.num).slice(-4),'<div id="oc-b"></div>',900);
  function sync(){var g=function(i){var x=$('#'+i);return x?x.value:undefined};var v;
    if((v=g('oc-nombre'))!==undefined)o.nombre=v.trim();if((v=g('oc-p'))!==undefined)o.prov=v;if((v=g('oc-f'))!==undefined)o.fecha=v;if((v=g('oc-en'))!==undefined)o.entrega=v;if((v=g('oc-so'))!==undefined)o.solicitante=v;if((v=g('oc-ar'))!==undefined)o.area=v;if((v=g('oc-pr'))!==undefined)o.prioridad=v;if((v=g('oc-pg'))!==undefined)o.pago=v;if((v=g('oc-iv'))!==undefined)o.iva=Number(v);if((v=g('oc-lu'))!==undefined)o.lugar=v;if((v=g('oc-n'))!==undefined)o.notas=v}
  function ready(){sync();if(!o.nombre){T('Escribe el nombre de la orden','error');var ni=$('#oc-nombre');if(ni)ni.focus();return false}if(!o.prov){T('Elige un proveedor','error');return false}if(!o.items.length){T('Agrega al menos un material','error');return false}if(o.items.some(function(i){return!(Number(i.cant)>0)})){T('Hay cantidades en cero','error');return false}return true}
  function save(msg,close){if(!hasPerm(nuevo?'purchases.create':'purchases.edit')){T('No tienes permiso para guardar esta orden','error');return false}o.creo=o.creo||who();put('oc',o.id,o);if(close!==false)m.classList.remove('open');if(msg)T(msg)}
  function draw(){$('#oc-b').innerHTML=body();var on=function(id,fn){var x=$('#'+id);if(x)x.onclick=fn};
     var nameInput=$('#oc-nombre');if(nameInput)nameInput.oninput=function(){o.nombre=this.value;var title=m.querySelector('.modal-header h3');if(title)title.textContent=(o.nombre.trim()||(nuevo?'Nueva orden':'Orden de compra'))+' · OC-'+('000'+o.num).slice(-4)};
    var s=$('#oc-s');if(s)s.onchange=function(){var i=parseInt(this.value,10),p=P[i];if(p){sync();if(o.items.some(function(x){return x.pid===pk(p)})){T('Ese material ya está en la orden','error');draw();return}o.items.push({pid:pk(p),desc:String(p.descripcion||p.clave),clave:p.clave,unidad:p.unidad||'',cant:Math.max(1,window.wrMin(p)-(Number(p.cantidad)||0)),rec:0,precio:Number(p.precio)||0});draw()}};
    Array.prototype.forEach.call(m.querySelectorAll('.oi'),function(i){i.onchange=function(){sync();o.items[+this.dataset.k][this.dataset.f]=Number(this.value)||0;draw()}});
    Array.prototype.forEach.call(m.querySelectorAll('.oi-d'),function(b){b.onclick=function(){sync();o.items.splice(+this.dataset.k,1);draw()}});
    ['oc-iv'].forEach(function(id){var x=$('#'+id);if(x)x.onchange=function(){sync();draw()}});
    var f=$('#oc-fl');if(f)f.onchange=function(){var fi=this.files[0];if(!fi)return;if(fi.size>1048576){T('El archivo supera 1 MB','error');this.value='';return}var r=new FileReader();r.onload=function(){sync();o.adjs.push({name:fi.name,type:fi.type,data:r.result});draw()};r.readAsDataURL(fi)};
    Array.prototype.forEach.call(m.querySelectorAll('.ad-dl'),function(a){a.onclick=function(e){e.preventDefault();var ad=o.adjs[+this.dataset.i],l=document.createElement('a');l.href=ad.data;l.download=ad.name;l.click()}});
    Array.prototype.forEach.call(m.querySelectorAll('.ad-x'),function(b){b.onclick=function(){sync();o.adjs.splice(+this.dataset.i,1);draw()}});
    Array.prototype.forEach.call(m.querySelectorAll('.rc-inv'),function(b){b.onclick=function(){var r=o.recs.filter(function(x){return x.id===b.dataset.id})[0];if(!r||(r.inv&&r.inv.done))return;
      if(!confirm(r.inv===undefined?'Esta recepción se registró antes de que existiera la entrada automática. Si ya capturaste esta entrada manualmente en Inventario, se DUPLICARÍA. ¿Dar entrada ahora?':'Se sumarán las cantidades recibidas al inventario y se registrará la ENTRADA en el Kardex. ¿Continuar?'))return;
      sync();var res=ingresar(o,r,false);if(!res.ok){T(res.err,'error');return}r.inv={done:true,at:new Date().toISOString(),by:who()};logE(o,'Entrada a inventario · '+res.n+' pzas');put('oc',o.id,o);T('Entrada registrada: +'+res.n+' pzas');draw()}});
    Array.prototype.forEach.call(m.querySelectorAll('.rc-an'),function(b){b.onclick=function(){var r=o.recs.filter(function(x){return x.id===b.dataset.id})[0];if(!r||r.anulada)return;
      if(!hasPerm('purchases.edit')||!hasPerm('inventory.edit')){T('No tienes permiso para anular recepciones','error');return}
      var mot=prompt('Motivo de la anulación (obligatorio):');if(!mot||!mot.trim())return;mot=mot.trim();
      var inv=!!(r.inv&&r.inv.done),leg=r.inv===undefined;
      if(!confirm(inv?'Se anulará la recepción y se registrará una SALIDA en el Kardex por las cantidades recibidas. ¿Continuar?':leg?'Esta recepción es anterior a la entrada automática: solo se ajusta la orden, NO el inventario (revisa si capturaste la entrada a mano). ¿Continuar?':'Se anulará la recepción (aún no había entrado al inventario). ¿Continuar?'))return;
      sync();if(inv){var res=revertir(o,r,mot);if(!res.ok){T(res.err,'error');return}}
      r.anulada={at:new Date().toISOString(),by:who(),motivo:mot};
      o.items.forEach(function(i,k){var q=Number(r.items&&r.items['i'+k])||0;i.rec=Math.max(0,(Number(i.rec)||0)-q)});
      restate(o);logE(o,'Recepción anulada'+(inv?' (salida de inventario)':'')+': '+mot);put('oc',o.id,o);T('Recepción anulada. Puedes registrar la recepción correcta de nuevo.');draw()}});
    on('oc-sv',function(){sync();if(!o.nombre){T('Escribe el nombre de la orden','error');var ni=$('#oc-nombre');if(ni)ni.focus();return}if(o.estado!=='Borrador'&&!ready())return;if(nuevo)logE(o,'Orden creada');save('Orden guardada')});
    on('oc-ap0',function(){if(!ready())return;setSt('Pendiente','Enviada a aprobación');save('Enviada a aprobación')});
    on('oc-ap',function(){if(!ready())return;o.aprobo=who();o.aprobadaEl=new Date().toISOString();setSt('Aprobada','Orden aprobada');save('Orden aprobada')});
    on('oc-ret',function(){var r=prompt('Motivo de la devolución:');if(r===null)return;sync();setSt('Borrador','Devuelta a borrador: '+r);save('Devuelta a borrador')});
    on('oc-en2',function(){sync();setSt('Enviada','Enviada al proveedor');save('Marcada como enviada')});
    on('oc-can',function(){var r=prompt('Motivo de la cancelación:');if(!r)return;sync();o.motivo=r;setSt('Cancelada','Cancelada: '+r);save('Orden cancelada')});
    on('oc-cl',function(){var r=prompt('Faltantes aceptados. Nota de cierre:');if(r===null)return;sync();setSt('Recibida','Cerrada con faltantes: '+r);save('Orden cerrada')});
    on('oc-del',function(){if(!hasPerm('purchases.delete')){T('No tienes permiso para eliminar órdenes','error');return}if(confirm('¿Eliminar esta orden?')){put('oc',o.id,null);m.classList.remove('open')}});
    on('oc-dup',function(){sync();editOC(o,true)});
    on('oc-rc',function(){sync();recv()});on('oc-pr',function(){sync();print()})}
  function setSt(st,ev){o.estado=st;logE(o,ev)}
  function recv(){if(!hasPerm('purchases.edit')||!hasPerm('inventory.edit')){T('Se requieren permisos para modificar compras e inventario','error');return}var pend=o.items.some(function(i){return(Number(i.cant)||0)>(Number(i.rec)||0)});if(!pend){T('No hay cantidades pendientes','error');return}
    var rows=o.items.map(function(i,k){var pe=Math.max(0,(Number(i.cant)||0)-(Number(i.rec)||0));return '<tr><td>'+E(i.desc)+'</td><td>'+i.cant+'</td><td>'+(Number(i.rec)||0)+'</td><td><b>'+pe+'</b></td><td><input type="number" min="0" max="'+pe+'" class="rv" data-k="'+k+'" data-m="'+pe+'" value="0" style="width:80px"'+(pe?'':' disabled')+'></td></tr>'}).join('');
    var m2=mo('Registrar recepción · OC-'+('000'+o.num).slice(-4),'<div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">'+F('Fecha de recepción','<input type="date" id="rv-f" value="'+today()+'">')+F('Factura / remisión del proveedor','<input id="rv-d" placeholder="No. de documento">')+F('Recibió','<input id="rv-p" value="'+E(who())+'">')+'</div><div style="overflow:auto"><table style="width:100%;margin-top:8px"><thead><tr><th>Material</th><th>Pedido</th><th>Ya recibido</th><th>Pendiente</th><th>Recibo ahora</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+F('Observaciones (daños, faltantes...)','<input id="rv-n">','margin-top:8px')+'<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-weight:400"><input type="checkbox" id="rv-inv" style="width:auto;margin-top:4px"'+(canReceive?' checked':' disabled')+'><span><b>Dar entrada al inventario y Kardex automáticamente</b><br><small>Suma al stock y registra una ENTRADA con el costo de la orden (sin IVA), igual que «Entrada de material». '+(canReceive?'':'Se requieren permisos de compras e inventario; la recepción quedará pendiente de inventariar.')+'</small></span></label><label style="display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-weight:400"><input type="checkbox" id="rv-pr" style="width:auto;margin-top:4px"'+(canReceive?'':' disabled')+'><span><small>Actualizar también el precio del material en el catálogo con el precio de esta orden</small></span></label>'+'<div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px"><button class="btn btn-outline" id="rv-all">Recibir todo lo pendiente</button><span><button class="btn btn-outline" id="rv-back">Volver</button> <button class="btn btn-primary" id="rv-ok">Guardar recepción</button></span></div>',820);
    $('#rv-all').onclick=function(){Array.prototype.forEach.call(m2.querySelectorAll('.rv'),function(x){x.value=x.dataset.m})};
    $('#rv-back').onclick=function(){editOC(ext.oc[o.id]||o)};
    $('#rv-ok').onclick=function(){var it={},tot2=0,bad=false;Array.prototype.forEach.call(m2.querySelectorAll('.rv'),function(x){var v=Number(x.value)||0;if(v<0||v>Number(x.dataset.m))bad=true;if(v>0){it['i'+x.dataset.k]=v;tot2+=v}});
      if(bad){T('Una cantidad excede lo pendiente','error');return}if(!tot2){T('Captura al menos una cantidad recibida','error');return}
      o.items.forEach(function(i,k){i.rec=(Number(i.rec)||0)+(it['i'+k]||0)});
      var rc={id:uid(),fecha:$('#rv-f').value,doc:$('#rv-d').value.trim(),por:$('#rv-p').value.trim(),nota:$('#rv-n').value.trim(),items:it,inv:false},msgInv='';
      if($('#rv-inv')&&$('#rv-inv').checked&&canReceive){var res=ingresar(o,rc,!!($('#rv-pr')&&$('#rv-pr').checked));if(res.ok){rc.inv={done:true,at:new Date().toISOString(),by:who()};msgInv=' · +'+res.n+' pzas al inventario'}else T((res.err||'No se pudo dar entrada')+' La recepción quedó pendiente de inventariar.','error')}
      o.recs.push(rc);
      var full=o.items.every(function(i){return(Number(i.rec)||0)>=(Number(i.cant)||0)});o.estado=full?'Recibida':'Entrega parcial';logE(o,(full?'Recepción completa':'Recepción parcial')+' · '+tot2+' pzas'+($('#rv-d').value?' · doc '+$('#rv-d').value:'')+msgInv);
      put('oc',o.id,o);m2.classList.remove('open');T((full?'Orden recibida completa':'Entrega parcial registrada')+msgInv)}}
  function print(){var v=ext.prov[o.prov]||{},w=window.open('','_blank');if(!w){T('Permite las ventanas emergentes','error');return}var rc=o.recs.length>0;
    w.document.write('<title>'+E(o.nombre||'Orden de compra')+' · OC-'+o.num+'</title><body style="font-family:Arial;padding:30px;font-size:13px"><div style="display:flex;justify-content:space-between;border-bottom:3px solid #064e3b;padding-bottom:8px"><h2 style="margin:0;color:#064e3b">ORDEN DE COMPRA</h2><div style="text-align:right"><b style="font-size:18px">OC-'+('000'+o.num).slice(-4)+'</b><br>Estado: '+o.estado+'</div></div><table width="100%" style="margin:12px 0"><tr><td valign="top"><b>Proveedor</b><br>'+E(v.nombre)+'<br>RFC: '+E(v.rfc)+'<br>'+E(v.contacto)+' · '+E(v.tel)+'<br>'+E(v.mail)+'</td><td valign="top"><b>Datos de la orden</b><br>Fecha: '+E(o.fecha)+'<br>Entrega requerida: '+E(o.entrega||'—')+'<br>Prioridad: '+E(o.prioridad)+'<br>Pago: '+E(o.pago)+'<br>Entregar en: '+E(o.lugar||'—')+'<br>Solicitante: '+E(o.solicitante)+'<br>Área/Partida: '+E(o.area||'—')+'</td></tr></table><table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse"><tr style="background:#ecfdf5"><th>#</th><th>Material</th><th>Unidad</th><th>Cant.</th>'+(rc?'<th>Recibido</th><th>Pend.</th>':'')+'<th>P. unit.</th><th>Importe</th></tr>'+o.items.map(function(i,k){return '<tr><td>'+(k+1)+'</td><td>'+E(i.desc)+'</td><td>'+E(i.unidad||'')+'</td><td align=right>'+i.cant+'</td>'+(rc?'<td align=right>'+(i.rec||0)+'</td><td align=right>'+Math.max(0,i.cant-(i.rec||0))+'</td>':'')+'<td align=right>'+money(i.precio)+'</td><td align=right>'+money(i.cant*i.precio)+'</td></tr>'}).join('')+'</table><div style="text-align:right;margin-top:8px">Subtotal: '+money(sub(o))+'<br>IVA '+o.iva+'%: '+money(sub(o)*o.iva/100)+'<br><b style="font-size:15px">Total: '+money(totO(o))+'</b></div><p><i>'+letras(totO(o))+'</i></p><p><b>Notas:</b> '+E(o.notas||'—')+'</p><table width="100%" style="margin-top:70px;text-align:center"><tr><td>______________________<br>Solicitó<br>'+E(o.solicitante)+'</td><td>______________________<br>Autorizó<br>'+E(o.aprobo||'')+'</td><td>______________________<br>Proveedor (acuse)</td></tr></table></body>');w.document.close();setTimeout(function(){w.print()},300)}
  draw()}
/* ---------- 1) SEGURIDAD: auditoría, contraseña propia y restablecimiento ---------- */
var DEF={admin:'240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',operador:'e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446'};
function defaultUsers(){return(typeof users!=='undefined'?users:[]).filter(function(u){return u.active!==false&&Object.keys(DEF).some(function(k){return u.passHash===DEF[k]})})}
function strength(p){var s=0;if(p.length>=8)s++;if(p.length>=12)s++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++;if(/\d/.test(p))s++;if(/[^A-Za-z0-9]/.test(p))s++;return s}
function pwModal(forced){var m=mo(forced?'Debes cambiar tu contraseña':'Cambiar mi contraseña','<p style="font-size:.85rem;margin-bottom:10px">'+(forced?'Tu cuenta usa una contraseña por defecto conocida públicamente. Elige una nueva ahora.':'Usa al menos 8 caracteres combinando letras y números.')+'</p><div class="form-grid" style="grid-template-columns:1fr"><div class="form-group"><label>Contraseña actual</label><input type="password" id="pw-a"></div><div class="form-group"><label>Nueva contraseña</label><input type="password" id="pw-n"><div id="pw-bar" style="height:6px;border-radius:9px;background:#e5e7eb;margin-top:6px"><i style="display:block;height:100%;width:0;border-radius:9px"></i></div></div><div class="form-group"><label>Repetir nueva contraseña</label><input type="password" id="pw-r"></div></div><div style="text-align:right;margin-top:12px"><button class="btn btn-primary" id="pw-s">Cambiar contraseña</button></div>');
  $('#pw-n').oninput=function(){var s=strength(this.value),i=$('#pw-bar i');i.style.width=s*20+'%';i.style.background=s<3?'#ef4444':s<4?'#f59e0b':'#059669'};
  $('#pw-s').onclick=async function(){var a=$('#pw-a').value,n=$('#pw-n').value,r=$('#pw-r').value;
    if(n.length<8||!/\d/.test(n)||!/[A-Za-z]/.test(n)){T('La nueva contraseña debe tener 8+ caracteres con letras y números','error');return}
    if(n!==r){T('Las contraseñas no coinciden','error');return}if(n===a){T('La nueva debe ser distinta a la actual','error');return}
    var u=users.filter(function(x){return String(x.id)===String(currentUser.id)||String(x.username).toLowerCase()===String(currentUser.username).toLowerCase()})[0];
    if(!u){T('No se encontró tu cuenta en la lista de usuarios','error');return}
    if((await hashSHA256(a))!==u.passHash){T('La contraseña actual es incorrecta','error');return}
    u.passHash=await hashSHA256(n);u.updatedAt=Date.now();await broadcastFullSync();m.classList.remove('open');T('Contraseña actualizada. Úsala la próxima vez que inicies sesión.')}}
window.wrChangePw=function(){pwModal(false)};
function rSec(){var s=$('#section-seguridad');var d=defaultUsers();
  s.innerHTML=card('<i class="fas fa-shield-halved" style="color:#059669"></i> Seguridad','Auditoría rápida y herramientas de cuentas. Solo visible para administradores.')+
  '<div class="net-box" style="margin-bottom:14px"><div class="net-box-title">Auditoría</div><div id="au-list" style="margin-top:8px;font-size:.9rem;line-height:1.9"></div><button class="btn btn-outline" id="au-run" style="margin-top:8px"><i class="fas fa-rotate"></i> Volver a revisar</button></div>'+
  '<div class="net-box" style="margin-bottom:14px"><div class="net-box-title">Cuentas</div><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Contraseña</th><th></th></tr></thead><tbody>'+(users||[]).map(function(u){var df=Object.keys(DEF).some(function(k){return u.passHash===DEF[k]});return '<tr><td><b>'+E(u.username)+'</b></td><td>'+E(u.role)+'</td><td style="color:'+(df?'#ef4444':'#059669')+';font-weight:800">'+(df?'Por defecto ⚠':'Personalizada')+'</td><td><button class="btn btn-outline" data-rs="'+E(u.id)+'">Restablecer</button></td></tr>'}).join('')+'</tbody></table></div><div class="net-box-sub" style="margin-top:8px">«Restablecer» genera una contraseña temporal que se muestra una sola vez; entrégala al usuario y pídele que la cambie desde el menú de su avatar.</div></div>'+
  '<div class="net-box"><div class="net-box-title">Reglas de Firebase</div><div class="net-box-sub">El archivo <b>database.rules.json</b> incluido en esta carpeta bloquea el acceso sin sesión. Pégalo en Firebase → Realtime Database → Reglas → Publicar. La auditoría de arriba comprueba si ya está activo.</div><button class="btn btn-outline" id="au-copy" style="margin-top:8px"><i class="fas fa-copy"></i> Copiar reglas</button></div>';
  Array.prototype.forEach.call(s.querySelectorAll('[data-rs]'),function(b){b.onclick=async function(){var u=users.filter(function(x){return String(x.id)===this.dataset.rs}.bind(this))[0];if(!u||!confirm('¿Generar contraseña temporal para '+u.username+'?'))return;
    var ch='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789',pw='',a=new Uint32Array(10);crypto.getRandomValues(a);a.forEach(function(x){pw+=ch[x%ch.length]});pw+=(10+Math.floor(Math.random()*89));
    u.passHash=await hashSHA256(pw);u.updatedAt=Date.now();await broadcastFullSync();mo('Contraseña temporal','<p>Usuario: <b>'+E(u.username)+'</b></p><p style="font-size:1.4rem;font-family:monospace;margin:12px 0"><b>'+pw+'</b></p><p style="font-size:.85rem">Cópiala ahora: no se volverá a mostrar.</p>')}});
  $('#au-run').onclick=audit;$('#au-copy').onclick=function(){try{navigator.clipboard.writeText(RULES).then(function(){T('Reglas copiadas: pégalas en Firebase → Reglas')})}catch(e){}};audit()}
var RULES='{\n  "rules": {\n    ".read": false,\n    ".write": false,\n    "compraPro": {\n      "rooms": { "$room": { ".read": "auth != null", ".write": "auth != null" } },\n      "ext": { "$room": { ".read": "auth != null", ".write": "auth != null" } }\n    }\n  }\n}';
function audit(){var L=$('#au-list');if(!L)return;var out=[],good=0,total=4,local=location.protocol==='file:';
  function show(){L.innerHTML=out.join('')+'<div style="margin-top:8px;font-weight:800">Nivel de seguridad: '+good+' de '+total+'</div>'}
  function add(st,t,note,btn){if(st===true)good++;out.push('<div>'+(st===true?'✅':st==='info'?'ℹ️':'⚠️')+' '+t+(note?' <small style="color:'+(st===false?'#ef4444':'var(--text-light)')+'">'+note+'</small>':'')+(btn||'')+'</div>');show();
    Array.prototype.forEach.call(L.querySelectorAll('[data-au]'),function(b){b.onclick=auAct})}
  add(local?'info':location.protocol==='https:','Sitio servido por HTTPS',local?'Estás en un archivo local; al publicarlo en tu sitio con https:// esto se resuelve solo.':'Abre el sitio con https://');
  var d=defaultUsers();add(!d.length,'Sin contraseñas por defecto activas',d.map(function(u){return u.username}).join(', ')+' usa(n) una contraseña pública (admin123 / user123)',d.length?' <button class="btn btn-outline" data-au="pw" style="padding:2px 8px">Restablecer</button>':'');
  var idle=(localStorage.getItem('wr-idle')||'0')!=='0';add(idle,'Cierre de sesión por inactividad','Recomendado: cierra la sesión si dejan la PC sola',idle?'':' <button class="btn btn-outline" data-au="idle" style="padding:2px 8px">Activar 30 min</button>');
  try{fetch(FIREBASE_CONFIG.databaseURL+'/compraPro/rooms.json?shallow=true',{cache:'no-store'}).then(function(r){
    if(r.status===401||r.status===403)add(true,'Base de datos cerrada al público','(sin iniciar sesión no se puede leer · HTTP '+r.status+')');
    else if(r.status===200)add(false,'Base de datos ABIERTA al público','Cualquiera con la dirección puede leer tus datos (HTTP 200). Publica las reglas.',' <button class="btn btn-outline" data-au="rules" style="padding:2px 8px">Copiar reglas</button> <button class="btn btn-outline" data-au="fb" style="padding:2px 8px">Abrir Firebase</button>');
    else{total--;add('info','No se pudo concluir la revisión de la base','(respuesta HTTP '+r.status+')')}}).catch(function(){total--;add('info','No se pudo comprobar la base de datos desde este navegador','(sin conexión o bloqueado)')})}catch(e){total--}}
function auAct(){var a=this.getAttribute('data-au');
  if(a==='idle'){try{localStorage.setItem('wr-idle','30')}catch(e){}if(window.wrApplyPrefs)window.wrApplyPrefs();T('Cierre por inactividad activado (30 min)');audit()}
  else if(a==='rules'){try{navigator.clipboard.writeText(RULES).then(function(){T('Reglas copiadas. Pégalas en Firebase → Reglas → Publicar')})}catch(e){mo('Reglas de Firebase','<textarea style="width:100%;height:240px;font-family:monospace">'+E(RULES)+'</textarea>')}}
  else if(a==='fb')window.open('https://console.firebase.google.com/project/compra-pro-888c9/database/compra-pro-888c9-default-rtdb/rules','_blank','noopener');
  else if(a==='pw'){var t=$('#section-seguridad table');if(t)t.scrollIntoView({behavior:'smooth',block:'center'})}}
/* ---------- Arranque ---------- */
function init(){mkNav();mkSection('stock-minimo','');mkSection('ordenes','');mkSection('seguridad','')}
init();load();
var oRole=window.applyUserRole;window.applyUserRole=function(){var r=oRole.apply(this,arguments);load();listen();
  setTimeout(function(){if(hasPerm('users.manage')&&defaultUsers().some(function(u){return String(u.id)===String(currentUser.id)||u.username===currentUser.username}))pwModal(true)},1500);return r};
setInterval(function(){if(!on&&typeof currentUser!=='undefined'&&currentUser)listen()},4000);
})();
