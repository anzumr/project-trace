# Production and LAN deployment

## GitHub and krazer.io

The source repository is `anzumr/project-trace` (private). GitHub Actions runs the unit/database tests, production build, and HTTP/WebSocket smoke test without production credentials. This is source hosting and CI, not a live deployment.

GitHub Pages is static hosting and cannot execute this game's authoritative Node/Socket.IO server. Keep the current same-origin architecture: connect the GitHub repository to a persistent Node web service, and point `krazer.io` to that service. See [GitHub Pages capabilities](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Configure the service from the repository root:

- Node version: 24.
- Build command: `npm ci --include=dev && npm run build`.
- Start command: `npm start`. Keep dev dependencies installed: the runtime uses `tsx`.
- Health check: `/health`. This checks HTTP availability, not database readiness.
- One running instance, with WebSocket support and no scale-to-zero. Queue and room state live in one process.
- Persistent storage mounted at the application's `.trace-data` directory for the result outbox. The exact absolute mount path depends on the host's working directory. Keep this storage private.

Set these in the hosting dashboard; do not commit real values:

| Variable | When needed | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Build | Existing Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build | Existing public publishable/anon key |
| `SUPABASE_URL` | Runtime | Same project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Runtime | Same public key |
| `SUPABASE_SECRET_KEY` | Runtime only | Server-only secret/service-role key |
| `NODE_ENV` | Runtime | `production` |
| `ALLOWED_ORIGINS` | Runtime | `https://krazer.io` (add the exact host preview URL while testing) |
| `PORT` | Runtime | Use the port assigned by the hosting service |

The `VITE_` values become public browser code. Never use the server secret there. Changing build-time values requires a rebuild. Existing local `.env` files are ignored by Git and will not transfer automatically.

The existing Supabase migrations are already applied to the current project; do not reapply them on each deploy. A different Supabase project needs both migrations in filename order.

Once a hosting service is selected:

1. Deploy to its temporary HTTPS address and add that origin to `ALLOWED_ORIGINS`.
2. Add `krazer.io` as a custom domain in that service. Copy its exact DNS records into your domain registrar; do not guess an IP address or change email/MX records.
3. Wait for the service to verify DNS and issue an HTTPS certificate. Add `www.krazer.io` only if you also configure its DNS, certificate and redirect/origin handling.
4. In Supabase Authentication → URL Configuration, set Site URL to `https://krazer.io` and allow `https://krazer.io/` as a redirect URL. Keep the localhost redirect for development if needed. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
5. Test login, confirmation/recovery links, private rooms, human Quick Play, cancellation, reconnect, optional AI and saved results from two external clients. Test the actual five-minute wait on the deployed service.

No domain DNS changes or live deployment are performed merely by pushing the repository.

## Local production check

```powershell
npm.cmd run build
npm.cmd start
```

Open http://localhost:3001. This single Node process serves the built client and Socket.IO on the same origin. It supports compressed build assets, immutable caching for hashed files, content types and security headers. `npm.cmd run test:production` tests the production HTTP/socket setup using a temporary port, then shuts it down.

Development remains `npm.cmd run dev` on port 5173, proxying sockets to 3001. The documented LAN origin allowlist still applies. No hosted deployment was created.

## HTTPS/WSS host

1. Use a persistent Node 22.12+ host with WebSockets. Upload the repository and run `npm ci` and `npm run build`.
2. Set `NODE_ENV=production`, `PORT=3001` and `ALLOWED_ORIGINS=https://your-domain.example` in the host environment. Production startup requires an explicit origin allowlist. Multiple origins are comma-separated, with exact schemes/ports and no trailing slash.
3. Run `npm start` under the host's process supervisor. Both server/shared TypeScript source and the tsx runtime remain required. Restarting loses in-memory rooms.
4. Put HTTPS in front of Node. `deploy/nginx.conf.example` is a concrete reverse-proxy template; replace the domain and certificate paths. It forwards WebSocket upgrades and uses a 75-second idle timeout. The Node server itself does not terminate TLS.
5. Expose only the HTTPS proxy publicly; keep backend 3001 private. Set up a valid certificate and test from two external devices. Verify `/health`, create/join, ready, full match, rematch, tab focus loss and disconnect.

## Boundaries

Socket ownership binds room actions to the actual connection. Input fields are validated; client positions/HP/hits are ignored. Browser origins are checked on socket handshakes. Non-browser clients without an Origin header are allowed, so origin checking is not authentication. Public play requires a verified Supabase account and claimed username; private rooms also allow guests. Only the server records official results.

Limits: 256 connected sockets, 100 rooms, 160 events/s per socket with a 240-event burst, separate 8/s control-event limit with 16-event burst, existing 100/s input acceptance limit, 12-input queue, and 4096-byte Socket.IO payload limit. Sustained packet floods disconnect. Periodic snapshots are volatile so slow transports do not queue unlimited state. These are basic resource controls, not a DDoS service or a comprehensive anti-cheat system.

If snapshots stall for one second, the client displays a warning and sends inactive input until snapshots resume. Server input silence disables movement/fire after 250 ms. Private disconnects forfeit immediately; public/AI matches pause for a 20-second reconnection window. Restarting loses live rooms and queues; persisted result-outbox entries retry. Lag compensation remains unimplemented.

Static serving rejects unsupported methods, unknown files, traversal and non-asset extensions. It applies CSP and nosniff headers; all UI fonts now use local system fallbacks. The HTTP production smoke test verifies local assets and sockets, not certificates, a remote proxy, public internet access or two-human fairness under latency.
