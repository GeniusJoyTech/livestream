---
name: Healthcheck root 500 on Replit deploy
description: Replit's deployment healthcheck hits GET / and follows redirects; a 302 leads to unexpected 500.
---

# Healthcheck root 500 on Replit deploy

## The rule
Replit's deployment healthcheck sends `GET /` and follows HTTP redirects. The final response MUST be HTTP 200 or the deployment is marked as failed (logs show "healthcheck / returned status 500").

**Why:** A `res.redirect('/login/login.html')` returns 302; the health checker follows to `/login/login.html`, which can fail if static file resolution is slow, or if the chain times out.

**How to apply:** The root handler in `server.js` returns a `200` response with an HTML `<meta http-equiv="refresh">` tag instead of a 302 redirect:
```js
app.get("/", (req, res) => {
  res.status(200).send('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/login/login.html"></head><body>Redirecionando...</body></html>');
});
```
Browsers auto-follow the meta-refresh; the healthcheck sees 200 and marks the deployment healthy.
