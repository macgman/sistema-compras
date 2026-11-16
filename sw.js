const V='compra-shell-v16-revision-seguridad-1',SHELL=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return; // Firebase, servidor de acceso y CDN van directo a la red
  const versioned=u.searchParams.has('v')||/\/img\//.test(u.pathname);
  if(versioned){ // CSS/JS/imágenes con ?v=: primero red para evitar servir código antiguo; caché como respaldo sin conexión
    e.respondWith(fetch(r,{cache:'no-store'}).then(res=>{if(res.ok&&res.status===200){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp)).catch(()=>{})}return res}).catch(()=>caches.match(r)));return}
  e.respondWith(fetch(r).then(res=>{if(res.ok&&res.status===200){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp)).catch(()=>{})}return res}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))))});
