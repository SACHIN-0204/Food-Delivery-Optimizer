// Minimal service worker whose only job is Web Push. Vite doesn't process
// this file — it's served as-is from /public, so it has to be plain JS with
// no imports/bundling assumptions.

self.addEventListener("push", (event) => {
  let data = { title: "Update", body: "", url: "/" };
  try {
    data = event.data.json();
  } catch {
    // If the payload isn't JSON for some reason, fall back to plain text.
    data.body = event.data?.text() || "";
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Food Delivery Optimizer", {
      body: data.body,
      icon: "/vite.svg",
      data: { url: data.url || "/" },
    })
  );
});

// Clicking the notification focuses an existing tab if one's open, or opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
