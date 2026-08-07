---
name: ws maxPayload needs error handler
description: Rejecting oversized WebSocket payloads emits an error event that kills the process if unhandled
---

Rule: any protective limit on `ws` connections (like `maxPayload`) must be paired with a per-connection `error` handler, because the rejection surfaces as an `error` event on the socket — unhandled, it crashes the entire Node process instead of just closing one connection.

**Why:** a protection meant to prevent memory crashes can itself become a denial-of-service vector if the rejection path is unhandled.

**How to apply:** register the error handler (log + terminate the socket) as the first thing in the connection handler.
