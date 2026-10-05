> Backend Wave 1 supersedes the historical backend-security status below. See [the Wave 1 completion report](docs/backend-wave-1/completion-report.md). The earlier Stitch ZIP/report remains a historical artifact.

# Stitch UI integration

This workspace contains the integrated Customer, Merchant, Rider and Admin applications from the supplied Deetoo source.

- Run `npm ci`, then `npm run dev` and open `http://localhost:3000`.
- Application links: `/#customer`, `/#merchant`, `/#rider`, `/#admin`.
- Build: `npm run build`.
- Read [the integration report](docs/integration/completion-report.md) before treating this as production-ready. It records exact tests, implementation gaps, the existing rider authorization failure and the realtime/payment limitations.
- [Screen mapping](docs/integration/screen-map.json), [test results](docs/integration/test-results.json), [backend preservation check](docs/integration/preservation-check.json).

The original README describes the supplied backend. This integration report takes precedence for claims about UI verification and completion. No live payment processing or production deployment was certified.
