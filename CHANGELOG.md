# eSIM Bridge V1 — Changelog

## V1.0 — Speed-Optimized Release

### Critical Fixes (from V0.9)
- **Query API: Added mandatory `pager` parameter** — API requires `{ pageSize, pageNum }`, without it queries silently failed
- **Duplicate protection with result caching** — prevents re-ordering on Sellauth retries (was causing 3x orders)
- **Error state preserved** — failed orders stay in cache as 'error', never re-ordered automatically

### Speed Optimizations
- **Response-first architecture** — customer gets 200 + eSIM data BEFORE any logging/stats/cache-update happens (`setImmediate()`)
- **Aggressive early polling** — 3s → 3s → 5s → 5s → 8s steady (instead of flat 10s). Most eSIMs are ready in <30s
- **HTTP keep-alive** — persistent connection to eSIMAccess API eliminates TCP/TLS handshake on every poll (~100-300ms saved per poll)
- **Async stats** — `statsService` writes to disk every 10s in background, never blocks request handling (was `writeFileSync` before)
- **Zero middleware on webhook** — removed request-logging middleware from webhook path
- **Lean auth** — signature verification has no logger import, zero I/O on success path
- **Shorter axios timeouts** — 15s for order, 10s for query (was 30s/15s), fail fast on network issues

### Templates
- English-only professional templates (7 single + 4 multi)
- Labeled format: `ICCID:` / `eSIM Installation:` on separate lines
- Multi-eSIM separator: `━━━ eSIM 1 of 3 ━━━`

### Architecture
```
Webhook arrives
  → JSON parse (express built-in)
  → HMAC verify (pure crypto, no I/O)
  → Cache check (in-memory Map)
  → Order eSIM (1 HTTP call)
  → Poll until ready (keep-alive connection, aggressive schedule)
  → Build message (string concat)
  → res.status(200).send(message)    ← CUSTOMER GETS DATA HERE
  → setImmediate:                    ← AFTER response sent
      - Update cache
      - Record stats (in-memory, flushed async)
      - Log to console
```
