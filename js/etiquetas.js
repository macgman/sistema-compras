/* ===== MÓDULO: Imprimir etiquetas de almacén (usa el Inventario Compras) =====
   Archivo independiente: no modifica app.js. Toma los materiales de la variable global `products`. */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var norm=function(s){return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()};
var digits=function(s){return String(s==null?'':s).replace(/\D/g,'')};
var toast=function(m,t){try{if(typeof showToast==='function')return showToast(m,t)}catch(e){} };

var SIZES=[
  {id:'7x5',   name:'etiqueta 7x5 (70.4 × 50.6 mm)', w:70.4, h:50.6},
  {id:'5x2',   name:'etiqueta (51.4 × 25.6 mm)', w:51.4, h:25.6},
  {id:'2x4',   name:'2 x 4 (50.8 × 101.6 mm)', w:50.8, h:101.6},
  {id:'4x4',   name:'4 x 4 (101.6 × 101.6 mm)', w:101.6, h:101.6},
  {id:'4x6',   name:'4 x 6 (101.6 × 152.4 mm)', w:101.6, h:152.4},
  {id:'custom',name:'Personalizado…', w:0, h:0}
];
var FONTS=[['orig','Original'],["Arial,Helvetica,sans-serif",'Arial'],["'Arial Black',Arial,sans-serif",'Arial Black'],["Calibri,Carlito,Arial,sans-serif",'Calibri'],["Verdana,Geneva,sans-serif",'Verdana'],["Tahoma,Geneva,sans-serif",'Tahoma'],["'Trebuchet MS',Arial,sans-serif",'Trebuchet MS'],["'Segoe UI',Arial,sans-serif",'Segoe UI'],["Impact,'Arial Narrow',sans-serif",'Impact'],["'Times New Roman',Times,serif",'Times New Roman'],["Georgia,serif",'Georgia'],["'Courier New',monospace",'Courier New']];

/* ---------- configuración guardada en este navegador ---------- */
var KEY='etq_cfg_compras';
var cfg={alm:'ALMACEN ISSSTE',logo:null,size:'7x5',cw:70.4,ch:50.6,rot:false,env:'ENVASE',tipo:'master',font:'orig',bold:true,useStock:false};
try{Object.assign(cfg,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
if(!SIZES.some(function(s){return s.id===cfg.size}))cfg.size='7x5';
cfg.fs=Object.assign({d:100,a:100,t:100,u:100},cfg.fs||{});
var DKEY='etq_desc_compras',dOver={};try{dOver=JSON.parse(localStorage.getItem(DKEY)||'{}')||{}}catch(e){}
function saveOver(){try{localStorage.setItem(DKEY,JSON.stringify(dOver))}catch(e){}}
function okey(it){return String(it.c||'')+'|'+norm(it.d)}
function labelDesc(it){var v=dOver[okey(it)];return (v!=null&&String(v).trim())?String(v):it.d}
function saveCfg(){try{localStorage.setItem(KEY,JSON.stringify(cfg))}catch(e){toast('No se pudo guardar la configuración de etiquetas','error')}}

/* ---------- materiales desde el inventario de compras ---------- */
function getProducts(){try{return (typeof products!=='undefined'&&Array.isArray(products))?products:[]}catch(e){return[]}}
function catalog(){return getProducts().filter(function(p){return p&&(p.clave||p.descripcion)}).map(function(p){
  return {id:p.id,c:String(p.clave||''),d:String(p.descripcion||''),um:String(p.unidad||'PIEZA').toUpperCase(),stock:Number(p.cantidad)||0,_k:digits(p.clave),_kn:norm(p.clave),_d:norm(p.descripcion)}})}

/* ---------- estilos (todo con prefijo #etq para no chocar con el sistema) ---------- */
var CSS='\
#etq{position:fixed;inset:0;z-index:9990;background:#eef1f4;color:#1d2530;display:none;flex-direction:column;font:14px/1.4 "Segoe UI",system-ui,Arial,sans-serif}\
#etq.open{display:flex}\
#etq *{box-sizing:border-box}\
#etq .e-top{display:flex;align-items:center;gap:12px;padding:10px 18px;background:#7a1f3d;color:#fff}\
#etq .e-top b{flex:1;font-size:16px}\
#etq .e-btn{height:36px;border:1px solid #d9dee5;background:#fff;color:#1d2530;border-radius:8px;padding:0 14px;font-weight:600;cursor:pointer;font:inherit;font-weight:600}\
#etq .e-btn:hover{background:#f7f8fa}\
#etq .e-btn.pri{background:#7a1f3d;border-color:#7a1f3d;color:#fff}\
#etq .e-btn.pri:hover{background:#9b2c51}\
#etq .e-btn:disabled{opacity:.5;cursor:not-allowed}\
#etq .e-top .e-btn{background:transparent;color:#fff;border-color:rgba(255,255,255,.4);height:32px}\
#etq .e-main{flex:1;display:grid;grid-template-columns:minmax(300px,420px) 1fr;grid-template-rows:minmax(0,1fr);gap:16px;padding:16px;min-height:0}\
#etq .e-panel{background:#fff;border:1px solid #d9dee5;border-radius:10px;display:flex;flex-direction:column;min-height:0}\
#etq .e-panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#667085;margin:0;padding:14px 16px 0}\
#etq .e-search{padding:12px 16px;border-bottom:1px solid #d9dee5}\
#etq .e-seg{display:flex;border:1px solid #d9dee5;border-radius:8px;overflow:hidden;margin-bottom:10px}\
#etq .e-seg button{flex:1;border:0;background:#fff;height:32px;font-size:13px;font-weight:600;color:#667085;cursor:pointer}\
#etq .e-seg button+button{border-left:1px solid #d9dee5}\
#etq .e-seg button.on{background:#f6e9ee;color:#7a1f3d}\
#etq .e-search input[type=text]{width:100%;height:40px;border:1px solid #d9dee5;border-radius:8px;padding:0 12px;font-size:15px;color:#1d2530;background:#fff}\
#etq .e-count{font-size:12px;color:#667085;margin-top:8px;display:flex;justify-content:space-between;gap:8px}\
#etq .e-results{flex:1;overflow:auto;min-height:0}\
#etq .e-res{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #eef0f3;background:#fff;padding:9px 16px;cursor:pointer;color:#1d2530}\
#etq .e-res:hover{background:#fafbfc}\
#etq .e-res.sel{background:#f6e9ee;box-shadow:inset 3px 0 0 #7a1f3d}\
#etq .e-res .k{font-family:Consolas,monospace;font-size:13px;color:#7a1f3d;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px}\
#etq .e-res .d{font-size:13px}\
#etq .e-res .um{font-family:system-ui,Arial,sans-serif;font-size:11px;font-weight:600;color:#7a1f3d;background:#f6e9ee;border-radius:99px;padding:1px 8px}\
#etq .e-res .st{font-family:system-ui,Arial,sans-serif;font-size:11px;font-weight:600;color:#1f7a4d;margin-left:6px}\
#etq .e-res .st.z{color:#b42318}\
#etq mark{background:#ffe58a;color:inherit;padding:0}\
#etq .e-work{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:16px;min-height:0}\
#etq .e-preview{overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:repeating-conic-gradient(#f3f4f6 0 25%,#fff 0 50%) 0 0/20px 20px}\
#etq .e-preview .cap{font-size:12px;color:#667085;margin-top:12px}\
#etq .e-controls{padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 14px;align-items:end;max-height:46vh;overflow:auto}\
#etq .e-field{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}\
#etq .e-field label{font-size:12px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:.04em}\
#etq .e-field label b{color:#7a1f3d;margin-left:4px}\
#etq .e-field input,#etq .e-field select{height:38px;border:1px solid #d9dee5;border-radius:8px;padding:0 10px;background:#fff;color:#1d2530;font:inherit}\
#etq .e-field input[type=range]{height:24px;padding:0;border:0;background:transparent;accent-color:#7a1f3d}\
#etq .e-field input[type=file]{height:auto;padding:6px;border:1px dashed #d9dee5}\
#etq .e-chk{display:flex;align-items:center;gap:8px;height:38px;margin-bottom:10px;font-size:13px}\
#etq .e-fsr{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;color:#667085;margin:2px 0 -2px}\
#etq .e-fsr button{border:0;background:none;color:#7a1f3d;cursor:pointer;font-weight:600;font-size:12px}\
#etq .e-actions{grid-column:1/-1;display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap}\
#etq .e-note{font-size:12px;color:#667085;flex:1}\
#etq .e-empty{color:#667085;text-align:center;padding:40px 16px}\
#etq .e-hide{display:none!important}\
#etq .e-desc-ed{grid-column:1/-1}\
#etq .e-desc-ed textarea{width:100%;min-height:62px;border:1px solid #d9dee5;border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;text-transform:uppercase;resize:vertical;color:#1d2530;background:#fffdf5}\
#etq .e-desc-ed .e-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;color:#667085;margin-top:4px}\
#etq .e-desc-ed .e-row button{border:0;background:none;color:#7a1f3d;cursor:pointer;font-weight:600;font-size:12px;padding:0}\
#etq .e-seg.tipo{margin:0;height:38px}#etq .e-seg.tipo button{height:100%}\
@media (max-width:820px){#etq{overflow:auto}#etq .e-main{grid-template-columns:1fr;grid-template-rows:auto}#etq .e-results{max-height:320px}#etq .e-preview{min-height:300px}}\
/* ===== ETIQUETA (idéntica al archivo original) ===== */\
.etq-l .lbl{position:relative;background:#fff;color:#000;container-type:size;overflow:hidden}\
#etq .e-preview .lbl{box-shadow:0 4px 18px rgba(0,0,0,.18)}\
.etq-l .lbl-rot{position:absolute;left:0;top:0;transform-origin:0 0}\
.etq-l .lbl-in{--u:min(1cqw, calc(1cqh * 1.391));position:absolute;inset:4.5cqh 3.5cqw;border:max(1px,calc(var(--u)*.38)) solid #000;display:flex;flex-direction:column;padding:calc(var(--u)*1.6) calc(var(--u)*2.2) calc(var(--u)*2);font-family:Arial,Helvetica,sans-serif}\
.etq-l .l-alm{align-self:flex-end;font-size:calc(var(--u)*3*var(--ka,1));letter-spacing:-.02em;line-height:1;margin-right:calc(var(--u)*.6);font-family:"Arial Narrow",Arial,sans-serif;color:#222}\
.etq-l .l-head{display:flex;align-items:center;gap:calc(var(--u)*3);margin-top:calc(var(--u)*.6)}\
.etq-l .l-logo{width:calc(var(--u)*17);height:calc(var(--u)*9);margin-left:calc(var(--u)*5);display:flex;align-items:center;justify-content:center;flex:none}\
.etq-l .l-logo img{width:100%;height:100%;object-fit:fill}.etq-l .l-logo svg{max-width:100%;max-height:100%}\
.etq-l .l-bar{flex:1;background:#cfcfcf;display:flex;align-items:center;height:calc(var(--u)*6);padding-left:calc(var(--u)*.6);min-width:0}\
.etq-l .l-mat{font-size:calc(var(--u)*2.7);font-family:Calibri,Carlito,Arial,sans-serif;color:#333;margin-right:calc(var(--u)*5.6)}\
.etq-l .l-num{font-size:calc(var(--u)*5.6);font-weight:700;font-family:Calibri,Carlito,Arial,sans-serif;letter-spacing:.01em;white-space:nowrap;line-height:1}\
.etq-l .l-dt{text-align:center;font-size:calc(var(--u)*3.9*var(--kt,1));font-family:Calibri,Carlito,Arial,sans-serif;color:#333;margin-top:calc(var(--u)*1.7);letter-spacing:.02em}\
.etq-l .l-desc{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;min-height:0;overflow:hidden;padding:calc(var(--u)*1) calc(var(--u)*1)}\
.etq-l .l-desc > span{display:block;width:100%;max-height:none;--fd:1;font-size:calc(var(--u)*4.6*var(--fd));font-weight:900;letter-spacing:.09em;line-height:1.55;text-transform:uppercase;word-break:normal;overflow-wrap:normal;hyphens:none}\
.etq-l .l-desc .nb{white-space:nowrap;font-size:inherit;letter-spacing:inherit}\
.etq-l .lbl-in.cf,.etq-l .lbl-in.cf *{font-family:var(--ff)!important}\
.etq-l .lbl-in.bold *{font-weight:700}\
.etq-l .lbl-in.bold .l-desc > span,.etq-l .lbl-in.bold .l-desc > span *{font-weight:900}\
.etq-l .l-foot{display:flex;align-items:center;padding:0 calc(var(--u)*1) calc(var(--u)*3) calc(var(--u)*12)}\
.etq-l .l-env{font-size:calc(var(--u)*7.6);font-weight:700;font-family:Calibri,Carlito,Arial,sans-serif;line-height:1;flex:1;white-space:nowrap}\
.etq-l .l-um{font-size:calc(var(--u)*4.9*var(--ku,1));font-weight:700;font-family:Calibri,Carlito,Arial,sans-serif;margin-right:calc(var(--u)*5.5)}\
.etq-l .l-umv{font-size:calc(var(--u)*4.9*var(--ku,1));font-family:Calibri,Carlito,Arial,sans-serif;margin-right:calc(var(--u)*13);white-space:nowrap}\
.etq-l .lbl-in.ind .l-env{display:none}\
.etq-l .lbl-in.ind .l-foot{justify-content:center;padding-left:calc(var(--u)*1)}\
.etq-l .lbl-in.ind .l-um{margin-right:calc(var(--u)*3)}\
.etq-l .lbl-in.ind .l-umv{margin-right:0}\
/* ===== IMPRESIÓN: solo se activa al imprimir etiquetas ===== */\
#etq-print{display:none}\
@media print{\
  body.etq-printing{background:#fff!important;margin:0!important;padding:0!important}\
  body.etq-printing > *:not(#etq-print){display:none!important}\
  body.etq-printing #etq-print{display:block!important;visibility:visible!important;position:static!important}\
  body.etq-printing #etq-print *{visibility:visible!important}\
  body.etq-printing .logo-ph{visibility:hidden}\
  body.etq-printing #etq-print .lbl{break-after:page;page-break-after:always}\
  body.etq-printing #etq-print .lbl:last-child{break-after:auto;page-break-after:auto}\
  body.etq-printing *{-webkit-print-color-adjust:exact;print-color-adjust:exact}\
}';

var HTML='\
<div class="e-top"><i class="fas fa-tags"></i><b>Etiquetas de Almacén · Inventario Compras</b>\
  <button class="e-btn" id="etqCfgBtn"><i class="fas fa-gear"></i> Configuración</button>\
  <button class="e-btn" id="etqClose"><i class="fas fa-xmark"></i> Cerrar</button></div>\
<div class="e-main">\
  <div class="e-panel"><h2>Buscar material del inventario</h2>\
    <div class="e-search">\
      <div class="e-seg" id="etqSeg"><button data-m="todo" class="on">Todo</button><button data-m="clave">Por clave</button><button data-m="desc">Por descripción</button></div>\
      <input type="text" id="etqQ" placeholder="Escribe la clave o la descripción…" autocomplete="off">\
      <div class="e-count"><span id="etqCount"></span><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="etqOnlyStock"> Solo con stock</label></div>\
    </div>\
    <div class="e-results" id="etqResults"></div>\
  </div>\
  <div class="e-work">\
    <div class="e-panel e-preview etq-l" id="etqPreview"><div class="e-empty">Selecciona un material para ver la etiqueta</div></div>\
    <div class="e-panel"><div class="e-controls">\
      <div class="e-field e-hide" id="etqCfgBox" style="grid-column:1/-1;border:1px solid #d9dee5;border-radius:8px;padding:12px;background:#fafbfc">\
        <div class="e-field"><label>Texto superior de la etiqueta</label><input id="etqAlm"></div>\
        <div class="e-field"><label>Logotipo (PNG / JPG)</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="file" id="etqLogo" accept="image/*"><button class="e-btn" type="button" id="etqLogoClear">Quitar logo</button></div></div>\
      </div>\
      <div class="e-field e-desc-ed"><label>Descripción en la etiqueta <b>(solo para imprimir, no cambia el inventario)</b></label>\
        <textarea id="etqDescTxt" placeholder="Selecciona un material" disabled></textarea>\
        <div class="e-row"><span id="etqDescCnt"></span><label style="display:flex;gap:5px;align-items:center;cursor:pointer;text-transform:none;font-weight:600"><input type="checkbox" id="etqDescKeep" checked> Recordar este texto para este material</label><button type="button" id="etqDescReset">↺ Volver al texto original</button></div></div>\
      <div class="e-field"><label>Tipo de etiqueta</label><div class="e-seg tipo" id="etqTipo"><button data-t="ind">Individual</button><button data-t="master">Master</button></div></div>\
      <div class="e-field"><label>Tamaño de etiqueta</label><select id="etqSize"></select></div>\
      <div class="e-field e-hide" id="etqCW"><label>Ancho (mm)</label><input id="etqW" type="number" min="20" max="200" step="0.1"></div>\
      <div class="e-field e-hide" id="etqCH"><label>Alto (mm)</label><input id="etqH" type="number" min="15" max="200" step="0.1"></div>\
      <label class="e-chk"><input type="checkbox" id="etqRot"> Rotar 90° (etiqueta vertical)</label>\
      <div class="e-field"><label>Envase / presentación</label><input id="etqEnv"></div>\
      <div class="e-field"><label>Unidad de medida (U/M)</label><input id="etqUm" list="etqUmList"></div>\
      <datalist id="etqUmList"><option>PIEZA</option><option>CAJA</option><option>PAQUETE</option><option>FRASCO</option><option>SOBRE</option><option>ROLLO</option><option>LITRO</option><option>JUEGO</option><option>TUBO</option><option>BOLSA</option></datalist>\
      <div class="e-field"><label>Copias</label><input id="etqCopies" type="number" min="1" max="500" value="1"></div>\
      <label class="e-chk"><input type="checkbox" id="etqUseStock"> Copias = existencia en inventario</label>\
      <div class="e-field"><label>Fuente (tipo de letra)</label><select id="etqFont"></select></div>\
      <label class="e-chk"><input type="checkbox" id="etqBold"> Todo en negrita</label>\
      <div class="e-fsr"><span>TAMAÑO DE LETRA (la descripción se reduce sola si no cabe completa)</span><button type="button" id="etqFsReset">Restablecer</button></div>\
      <label class="e-chk" style="grid-column:1/-1;margin:0"><input type="checkbox" id="etqAuto"> Ajuste automático de la descripción (desmárcalo para que el control de abajo ponga el tamaño exacto)</label>\
      <div class="e-field"><label>Descripción <b id="etqV_d"></b></label><input type="range" id="etqFs_d" min="30" max="250" step="5"></div>\
      <div class="e-field"><label>Almacén <b id="etqV_a"></b></label><input type="range" id="etqFs_a" min="50" max="220" step="5"></div>\
      <div class="e-field"><label>"DESCRIPCION" <b id="etqV_t"></b></label><input type="range" id="etqFs_t" min="50" max="200" step="5"></div>\
      <div class="e-field"><label>U/M y envase <b id="etqV_u"></b></label><input type="range" id="etqFs_u" min="50" max="160" step="5"></div>\
      <div class="e-actions"><span class="e-note" id="etqSelInfo"></span><button class="e-btn pri" id="etqPrint" disabled><i class="fas fa-print"></i> Imprimir etiqueta</button></div>\
    </div></div>\
  </div>\
</div>';

var built=false,mode='todo',selected=null,shown=[],CAT=[],lastFit={f:1,nf:1};
var LOGO_DEFAULT='<svg class="logo-ph" viewBox="0 0 60 34" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="58" height="32" rx="3" fill="none" stroke="#999" stroke-dasharray="3 2"/><text x="30" y="21" font-family="Arial" font-size="10" text-anchor="middle" fill="#999">LOGO</text></svg>';
var wrapNb=function(s){return s.replace(/\S*[-\/]\S*/g,function(m){return '<span class="nb">'+m+'</span>'})};

function build(){
  if(built)return; built=true;
  var st=document.createElement('style');st.id='etq-style';st.textContent=CSS;document.head.appendChild(st);
  var ps=document.createElement('style');ps.id='etq-page';document.head.appendChild(ps);
  var root=document.createElement('div');root.id='etq';root.innerHTML=HTML;document.body.appendChild(root);
  var pa=document.createElement('div');pa.id='etq-print';pa.className='etq-l';document.body.appendChild(pa);

  $('#etqSize').innerHTML=SIZES.map(function(s){return '<option value="'+s.id+'">'+s.name+'</option>'}).join('');
  $('#etqFont').innerHTML=FONTS.map(function(x){return '<option value="'+esc(x[0])+'">'+x[1]+'</option>'}).join('');
  $('#etqSize').value=cfg.size;$('#etqW').value=cfg.cw;$('#etqH').value=cfg.ch;$('#etqRot').checked=!!cfg.rot;
  $('#etqEnv').value=cfg.env;$('#etqFont').value=cfg.font;if($('#etqFont').value!==cfg.font){cfg.font='orig';$('#etqFont').value='orig'}
  $('#etqBold').checked=!!cfg.bold;$('#etqAuto').checked=cfg.autoDesc!==false;$('#etqUseStock').checked=!!cfg.useStock;$('#etqAlm').value=cfg.alm;
  toggleCustom();setTipo(cfg.tipo,true);syncFs();

  $('#etqClose').onclick=close;
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&$('#etq').classList.contains('open'))close()});
  $('#etqCfgBtn').onclick=function(){$('#etqCfgBox').classList.toggle('e-hide')};
  $('#etqAlm').oninput=function(){cfg.alm=this.value;saveCfg();renderPreview()};
  $('#etqLogo').onchange=function(e){var f=e.target.files[0];if(!f)return;var img=new Image(),rd=new FileReader();
    rd.onload=function(){img.onload=function(){var k=Math.min(1,300/Math.max(img.width,img.height)),c=document.createElement('canvas');
      c.width=img.width*k;c.height=img.height*k;c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      cfg.logo=c.toDataURL('image/png');saveCfg();renderPreview();toast('Logo guardado')};img.src=rd.result};rd.readAsDataURL(f)};
  $('#etqLogoClear').onclick=function(){cfg.logo=null;$('#etqLogo').value='';saveCfg();renderPreview();toast('Logo quitado')};

  $('#etqSeg').onclick=function(e){var m=e.target.dataset.m;if(!m)return;mode=m;
    $$('#etqSeg button').forEach(function(b){b.classList.toggle('on',b.dataset.m===m)});
    $('#etqQ').placeholder=m==='clave'?'Ej. 0600880652 o 060-088-0652':m==='desc'?'Ej. apositos hidrocoloides':'Escribe la clave o la descripción…';
    search();$('#etqQ').focus()};
  $('#etqQ').addEventListener('input',search);
  $('#etqOnlyStock').addEventListener('change',search);
  $('#etqQ').addEventListener('keydown',function(e){if(e.key==='Enter'&&shown.length)select(shown[0])});
  $('#etqResults').onclick=function(e){var b=e.target.closest('.e-res');if(b)select(shown[+b.dataset.i])};
  $('#etqTipo').onclick=function(e){var t=e.target.dataset.t;if(t)setTipo(t)};

  ['#etqSize','#etqW','#etqH','#etqRot'].forEach(function(s){$(s).addEventListener('change',onOpts)});
  ['#etqEnv','#etqUm','#etqW','#etqH'].forEach(function(s){$(s).addEventListener('input',onOpts)});
  $('#etqSize').addEventListener('change',function(){var d=dims();$('#etqRot').checked=d.ph>d.pw*1.15;onOpts()});
  $('#etqFont').addEventListener('change',function(){cfg.font=this.value;saveCfg();renderPreview()});
  $('#etqBold').addEventListener('change',function(){cfg.bold=this.checked;saveCfg();renderPreview()});
  $('#etqUseStock').addEventListener('change',function(){cfg.useStock=this.checked;saveCfg();syncCopies()});
  ['d','a','t','u'].forEach(function(k){$('#etqFs_'+k).addEventListener('input',function(){cfg.fs[k]=+this.value;$('#etqV_'+k).textContent=cfg.fs[k]+'%';saveCfg();renderPreview()})});
  $('#etqFsReset').onclick=function(){cfg.fs={d:100,a:100,t:100,u:100};syncFs();saveCfg();renderPreview()};
  $('#etqPrint').onclick=print;
  $('#etqAuto').addEventListener('change',function(){cfg.autoDesc=this.checked;saveCfg();renderPreview()});
  $('#etqFs_d').addEventListener('input',function(){if(cfg.autoDesc!==false){cfg.autoDesc=false;$('#etqAuto').checked=false;saveCfg();renderPreview()}});
  $('#etqDescTxt').addEventListener('input',function(){if(!selected)return;var v=this.value.replace(/\s+/g,' ');
    if($('#etqDescKeep').checked){if(v.trim()&&v.trim()!==selected.d)dOver[okey(selected)]=v;else delete dOver[okey(selected)];saveOver()}
    selected._tmp=v;descCount();renderPreview()});
  $('#etqDescKeep').addEventListener('change',function(){if(!selected)return;if(this.checked){var v=$('#etqDescTxt').value;if(v.trim()&&v.trim()!==selected.d)dOver[okey(selected)]=v}else delete dOver[okey(selected)];saveOver()});
  $('#etqDescReset').onclick=function(){if(!selected)return;delete dOver[okey(selected)];saveOver();selected._tmp=null;$('#etqDescTxt').value=selected.d;descCount();renderPreview()};
  window.addEventListener('resize',function(){if(selected&&$('#etq').classList.contains('open'))renderPreview()});
  window.addEventListener('afterprint',function(){document.body.classList.remove('etq-printing');$('#etq-print').innerHTML=''});
}

function curDesc(){if(!selected)return'';return (selected._tmp!=null&&selected._tmp.trim())?selected._tmp:labelDesc(selected)}
function descCount(){var t=curDesc(),o=selected?selected.d:'';$('#etqDescCnt').textContent=t.length+' letras'+(t!==o?' · original: '+o.length:'')}
function syncFs(){['d','a','t','u'].forEach(function(k){$('#etqFs_'+k).value=cfg.fs[k];$('#etqV_'+k).textContent=cfg.fs[k]+'%'})}
function toggleCustom(){var c=$('#etqSize').value==='custom';$('#etqCW').classList.toggle('e-hide',!c);$('#etqCH').classList.toggle('e-hide',!c)}
function setTipo(t,noRender){cfg.tipo=t;saveCfg();
  $$('#etqTipo button').forEach(function(b){b.classList.toggle('on',b.dataset.t===t)});
  $('#etqEnv').disabled=t==='ind';$('#etqEnv').closest('.e-field').style.opacity=t==='ind'?.45:1;
  if(!noRender)renderPreview()}
function dims(){var s=SIZES.filter(function(x){return x.id===$('#etqSize').value})[0]||SIZES[0];
  var w=s.id==='custom'?(+$('#etqW').value||70.4):s.w,h=s.id==='custom'?(+$('#etqH').value||50.6):s.h;
  return {pw:w,ph:h,rot:$('#etqRot').checked}}
function onOpts(){toggleCustom();
  Object.assign(cfg,{size:$('#etqSize').value,cw:+$('#etqW').value,ch:+$('#etqH').value,rot:$('#etqRot').checked,env:$('#etqEnv').value});
  saveCfg();renderPreview()}
function syncCopies(){var c=$('#etqCopies');if(cfg.useStock&&selected){c.value=Math.max(1,Math.min(500,Math.floor(selected.stock)||1));c.disabled=true}else c.disabled=false}

function highlight(text,words){var out=esc(text);if(!words.length)return out;
  var n=norm(text),marks=new Array(text.length).fill(false);
  if(n.length!==text.length)return out;
  words.forEach(function(w){var i=-1;while((i=n.indexOf(w,i+1))>=0)for(var j=i;j<i+w.length;j++)marks[j]=true});
  var s='',on=false;for(var i=0;i<text.length;i++){if(marks[i]!==on){s+=marks[i]?'<mark>':'</mark>';on=marks[i]}s+=esc(text[i])}
  return s+(on?'</mark>':'')}

function search(){
  var raw=$('#etqQ').value,qn=norm(raw),qd=digits(raw),words=qn.split(' ').filter(Boolean),only=$('#etqOnlyStock').checked;
  var r=CAT.filter(function(x){
    if(only&&x.stock<=0)return false;
    if(!qn)return true;
    var byK=(qd&&x._k.indexOf(qd)>=0)||x._kn.indexOf(qn)>=0;
    var byD=words.every(function(w){return x._d.indexOf(w)>=0});
    return mode==='clave'?byK:mode==='desc'?byD:(byK||byD)});
  if(qd&&mode!=='desc')r=r.slice().sort(function(a,b){return (b._k.indexOf(qd)===0)-(a._k.indexOf(qd)===0)});
  shown=r.slice(0,200);
  $('#etqCount').textContent=r.length+' material'+(r.length===1?'':'es')+(r.length>shown.length?' · mostrando '+shown.length:'');
  $('#etqResults').innerHTML=shown.length?shown.map(function(x,i){return '<button class="e-res'+(selected&&selected.id===x.id?' sel':'')+'" data-i="'+i+'">'+
    '<div class="k"><span>'+esc(x.c)+'</span><span><span class="um">'+esc(x.um||'PIEZA')+'</span><span class="st'+(x.stock>0?'':' z')+'">Stock: '+x.stock+'</span></span></div>'+
    '<div class="d">'+(mode==='clave'?esc(x.d):highlight(x.d,words))+'</div></button>'}).join('')
    :'<div class="e-empty">'+(CAT.length?'Sin resultados':'El inventario está vacío o aún se está cargando')+'</div>';
}

function select(item){selected=item;$('#etqUm').value=item.um||'PIEZA';
  $$('#etqResults .e-res').forEach(function(b){b.classList.toggle('sel',shown[+b.dataset.i]===item)});
  $('#etqPrint').disabled=false;item._tmp=null;var ta=$('#etqDescTxt');ta.disabled=false;ta.value=labelDesc(item);$('#etqDescKeep').checked=true;descCount();syncCopies();renderPreview()}

function labelHTML(item,pw,ph,rot,unit){
  var cw=rot?ph:pw,chh=rot?pw:ph,logo=cfg.logo?'<img src="'+cfg.logo+'" alt="">':LOGO_DEFAULT;
  var inner='<div class="lbl-in'+(cfg.tipo==='ind'?' ind':'')+(cfg.bold?' bold':'')+(cfg.font!=='orig'?' cf':'')+'" style="--ff:'+esc(cfg.font)+';--ka:'+cfg.fs.a/100+';--kt:'+cfg.fs.t/100+';--ku:'+cfg.fs.u/100+'">'+
    '<div class="l-alm">'+esc(cfg.alm)+'</div>'+
    '<div class="l-head"><div class="l-logo">'+logo+'</div><div class="l-bar"><span class="l-mat">MAT.</span><span class="l-num">'+esc(item.c)+'</span></div></div>'+
    '<div class="l-dt">DESCRIPCION</div>'+
    '<div class="l-desc"><span>'+wrapNb(esc(item===selected?curDesc():labelDesc(item)))+'</span></div>'+
    '<div class="l-foot"><span class="l-env">'+esc($('#etqEnv').value)+'</span><span class="l-um">U/M:</span><span class="l-umv">'+esc($('#etqUm').value)+'</span></div></div>';
  var content=rot?'<div class="lbl lbl-rot" style="width:'+cw+unit+';height:'+chh+unit+';transform:translateX('+pw+unit+') rotate(90deg)">'+inner+'</div>':inner;
  return '<div class="lbl" style="width:'+pw+unit+';height:'+ph+unit+'">'+content+'</div>'}

function fit(root){
  var span=root.querySelector('.l-desc > span'),box=root.querySelector('.l-desc'),inn=root.querySelector('.lbl-in');
  var kd=(cfg.fs.d||100)/100,f;
  span.style.overflowWrap='normal';span.style.wordBreak='normal';
  var tooBig=function(){var h=box.clientHeight;return span.scrollHeight>h-2||span.scrollWidth>span.clientWidth+2};
  var lo=0.5,hi=3.2,ok=lo;
  for(var it=0;it<14;it++){var mid=(lo+hi)/2;span.style.setProperty('--fd',mid);if(tooBig())hi=mid;else{ok=mid;lo=mid}}
  /* automático: el tamaño máximo que cabe (el control solo puede reducirlo); manual: 100% = tamaño que cabe, el control lo agranda o reduce libremente */
  f=cfg.autoDesc===false?ok*kd:Math.min(ok,ok*kd);
  span.style.setProperty('--fd',f);
  if(tooBig()&&cfg.autoDesc!==false)span.style.overflowWrap='anywhere';
  var ft=root.querySelector('.l-foot'),ku=(cfg.fs.u||100)/100;inn.style.setProperty('--ku',ku);
  while(ku>0.4&&ft.scrollWidth>ft.clientWidth+1){ku-=.05;inn.style.setProperty('--ku',ku)}
  var num=root.querySelector('.l-num'),bar=root.querySelector('.l-bar');num.style.transform='';
  var over=num.getBoundingClientRect().right-bar.getBoundingClientRect().right,nf=1;
  if(over>0){nf=Math.max(.5,(num.offsetWidth-over-4)/num.offsetWidth);num.style.transform='scaleX('+nf+')';num.style.transformOrigin='left center'}
  return {f:f,nf:nf,ku:ku,ow:span.style.overflowWrap}}

function renderPreview(){
  if(!selected)return;
  $('#etqSelInfo').textContent=selected.c+' · '+selected.d+' · Stock: '+selected.stock;
  var d=dims(),box=$('#etqPreview'),maxW=Math.max(200,box.clientWidth-60),maxH=Math.max(180,box.clientHeight-80);
  var k=Math.min(maxW/d.pw,maxH/d.ph,7);
  box.innerHTML=labelHTML(selected,+(d.pw*k).toFixed(1),+(d.ph*k).toFixed(1),d.rot,'px')+'<div class="cap">Vista previa · '+d.pw+' × '+d.ph+' mm'+(d.rot?' · girada 90°':'')+'</div>';
  lastFit=fit(box)}

function print(){
  if(!selected)return;
  var d=dims(),n=Math.min(500,Math.max(1,parseInt($('#etqCopies').value)||1));
  $('#etq-page').textContent='@media print{@page{size:'+d.pw+'mm '+d.ph+'mm;margin:0}}';
  var pa=$('#etq-print');pa.innerHTML=new Array(n+1).join(labelHTML(selected,d.pw,d.ph,d.rot,'mm'));
  $$('.lbl-in',pa).forEach(function(el){
    var sp=el.querySelector('.l-desc > span');sp.style.setProperty('--fd',lastFit.f);if(lastFit.ow)sp.style.overflowWrap=lastFit.ow;if(lastFit.ku)el.style.setProperty('--ku',lastFit.ku);
    if(lastFit.nf<1){var num=el.querySelector('.l-num');num.style.transform='scaleX('+lastFit.nf+')';num.style.transformOrigin='left center'}});
  document.body.classList.add('etq-printing');
  setTimeout(function(){window.print();setTimeout(function(){document.body.classList.remove('etq-printing');$('#etq-page').textContent=''},500)},50)}

function open(){
  build();CAT=catalog();
  if(selected){var again=CAT.filter(function(x){return x.id===selected.id})[0];selected=again||null;
    if(!selected){$('#etqPreview').innerHTML='<div class="e-empty">Selecciona un material para ver la etiqueta</div>';$('#etqPrint').disabled=true;$('#etqSelInfo').textContent=''}}
  $('#etq').classList.add('open');search();
  if(selected){syncCopies();setTimeout(renderPreview,0)}
  setTimeout(function(){$('#etqQ').focus()},50)}
function close(){$('#etq').classList.remove('open')}

window.openEtiquetasModal=open;
})();
