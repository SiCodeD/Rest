# EduPulse - SaaS School Management System

## Overview
EduPulse is a modern, scalable SaaS solution for school management, built with Vanilla JavaScript, Tailwind CSS, and Supabase.

## Architecture
- **Frontend**: Multi-page application (MPA) using static HTML and JavaScript.
- **Backend**: Supabase (PostgreSQL, Auth, RLS).
- **Security**: 
  - Row-Level Security (RLS) policies to isolate school data.
  - Client-side sanitization for XSS prevention.
  - Future: Vite-based bundling and obfuscation.

## Getting Started

### Prerequisites
- Node.js (for build tools)
- Supabase account

### Installation
1. Clone the repository.
2. Configure your Supabase credentials in `js/supabase-config.js`.
3. Install dependencies:
   ```bash
   npm install
   ```

### Development
To run the project in development mode with hot-reloading:
```bash
npm run dev
```

Menu image API routes run in the Cloudflare Worker, not the Vite server. The R2 binding is configured as remote, so local Worker development reads and writes the actual Cloudflare bucket. Create `.dev.vars` with `SUPABASE_ANON_KEY=<your anon key>`, authenticate Wrangler with `npx wrangler login`, and make sure the configured bucket exists. Then run `npx wrangler dev --port 8787` in a second terminal alongside Vite. Vite proxies the menu image routes to that Worker. Uploads and deletions while developing affect the real bucket.

### Production Build
To generate a secure, minified, and obfuscated build for production:
```bash
npm run build
```
The output will be in the `dist/` directory.

## Menu Image Storage (Cloudflare R2)
Menu item images are stored in a private R2 bucket and served through the existing Cloudflare Worker. Uploads require a valid Supabase session and an admin profile for the restaurant; the bucket itself is not public.

Before deploying:
1. Create the R2 bucket configured in `wrangler.jsonc`:
   ```bash
   npx wrangler r2 bucket create mersalak-menu-images
   ```
2. Add the Supabase anon key as a Worker secret (use the same public anon key configured by the app):
   ```bash
   npx wrangler secret put SUPABASE_ANON_KEY
   ```
3. Deploy the Worker and static assets:
   ```bash
   npm run build
   npx wrangler deploy
   ```

For local Worker development, put `SUPABASE_ANON_KEY=<your anon key>` in an ignored `.dev.vars` file, then run `npx wrangler dev`. Do not put R2 credentials or Supabase service-role keys in the frontend or Worker variables.

## Security Policies (RLS)
The system uses `school_id` to ensure that users can only access data belonging to their institution.

## Order Payment Workflow
Apply `supabase/20261028_order_payment_workflow.sql` to enable audited payment confirmation from invoice details. Restaurant admins can confirm cash received or approve/reject an electronic payment proof; these changes are validated server-side and logged in `order_payment_events`.

### Tables & Policies
- `profiles`: Users can read their own profile; admins can manage school profiles.
- `students`: Isolated by `school_id`.
- `teacher_assignments`: Maps teachers to classes and subjects.
- `notifications`: Secure messaging between staff and parents.

## Maintenance
- **Sanitization**: Always use `Security.sanitize(data)` when rendering dynamic content.
- **API**: Centralize Supabase queries in dedicated JS modules.
"# SaaS" 
