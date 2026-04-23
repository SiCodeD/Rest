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

### Production Build
To generate a secure, minified, and obfuscated build for production:
```bash
npm run build
```
The output will be in the `dist/` directory.

## Security Policies (RLS)
The system uses `school_id` to ensure that users can only access data belonging to their institution.

### Tables & Policies
- `profiles`: Users can read their own profile; admins can manage school profiles.
- `students`: Isolated by `school_id`.
- `teacher_assignments`: Maps teachers to classes and subjects.
- `notifications`: Secure messaging between staff and parents.

## Maintenance
- **Sanitization**: Always use `Security.sanitize(data)` when rendering dynamic content.
- **API**: Centralize Supabase queries in dedicated JS modules.
"# SaaS" 
