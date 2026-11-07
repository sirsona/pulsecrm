# PulseCRM Dashboard

Next.js operations dashboard for PulseCRM. It contains:

- CRM lead management, broadcast, and cron views at `/crm`
- Chama treasurer views at `/treasurer`
- A runtime API proxy at `/api/proxy`

## Development

```bash
npm install
npm run dev
```

The dashboard expects the Express API at `EXPRESS_URL` (default
`http://localhost:5000`).
