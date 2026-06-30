// YUGM AI Service Worker — handles push notifications (spec Section 12).
// Receives push events, shows notifications, and handles click-to-open.

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", function (event) {
  var data = { title: "YUGM AI", body: "", link: "/" };
  if (event.data) {
    try {
      var payload = event.data.json();
      data.title = payload.title || data.title;
      data.body = payload.body || data.body;
      data.link = payload.link || data.link;
    } catch (e) {
      data.body = event.data.text();
    }
  }

  var options = {
    body: data.body,
    icon: "logo.png",
    badge: "logo.png",
    vibrate: [100, 50, 100],
    data: { link: data.link },
    actions: [
      { action: "open", title: "Open" }
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return clients.openWindow(link);
    })
  );
});
