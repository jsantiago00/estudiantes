/* Estudiemos: recibe las notificaciones push (Firebase Cloud Messaging) con la app cerrada.
   El notificador manda mensajes "solo datos" {titulo, cuerpo, url, tag}, y acá se muestran. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA-nc9CsjlyY2gaNf5IFHgfC4YdJGStvDM",
  authDomain: "pizarra-d6457.firebaseapp.com",
  projectId: "pizarra-d6457",
  storageBucket: "pizarra-d6457.firebasestorage.app",
  messagingSenderId: "433602034958",
  appId: "1:433602034958:web:f205eb87d4e419d3052b5f"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(m=>{
  const d = m.data || {};
  return self.registration.showNotification(d.titulo || 'Estudiemos', {
    body: d.cuerpo || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-32.png',
    tag: d.tag || undefined,
    data: {url: d.url || './'}
  });
});

self.addEventListener('notificationclick', ev=>{
  ev.notification.close();
  const destino = new URL((ev.notification.data && ev.notification.data.url) || './', self.registration.scope).href;
  ev.waitUntil((async ()=>{
    const ventanas = await clients.matchAll({type: 'window', includeUncontrolled: true});
    for(const w of ventanas){
      if(w.url.split('#')[0].split('?')[0] === destino.split('#')[0].split('?')[0] && 'focus' in w){
        await w.focus();
        if('navigate' in w && w.url !== destino) await w.navigate(destino).catch(()=>{});
        return;
      }
    }
    await clients.openWindow(destino);
  })());
});

self.addEventListener('install', ()=>self.skipWaiting());
self.addEventListener('activate', ev=>ev.waitUntil(clients.claim()));
