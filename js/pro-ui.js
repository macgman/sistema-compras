
(function(){
  'use strict';
  var body=document.documentElement, btn=document.getElementById('menu-toggle'), scrim=document.getElementById('sidebar-scrim'), side=document.getElementById('sidebar');
  function setNav(open){ body.classList.toggle('nav-open',open); if(btn){btn.setAttribute('aria-expanded',String(open)); btn.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');} }
  if(btn) btn.addEventListener('click',function(){ setNav(!body.classList.contains('nav-open')); });
  if(scrim) scrim.addEventListener('click',function(){ setNav(false); });
  if(side) side.addEventListener('click',function(e){ if(e.target.closest('nav a')) setNav(false); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape' && body.classList.contains('nav-open')) setNav(false); });
  window.addEventListener('resize',function(){ if(window.innerWidth>1024) setNav(false); });
  // Pie de página profesional
  var main=document.getElementById('main');
  if(main && !document.getElementById('app-footer')){
    var f=document.createElement('footer'); f.id='app-footer'; f.className='app-footer no-print';
    f.innerHTML='<span><b>COMPRA</b> · Gestión de inventario y compras</span><span class="app-footer-ver"><i class="fas fa-shield-halved"></i> Versión 3.0.10</span><span>© 2026 Mario Alberto Chable García · Lic. en Informática</span>';
    main.appendChild(f);
  }
})();
