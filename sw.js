self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window" });
    const dashboard = open.find(client => client.url.startsWith(self.registration.scope));
    if (dashboard) return dashboard.focus();
    return self.clients.openWindow("./");
  })());
});
