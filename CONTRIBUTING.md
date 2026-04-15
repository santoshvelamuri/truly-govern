# Contributing to Archigent

Thank you for your interest in contributing to Archigent! This guide will help you get set up and understand our development workflow.

## Prerequisites

- **Node.js** 18 or later
- **npm** (comes with Node.js)
- **Supabase** account -- [sign up free](https://supabase.com)
- **OpenAI API key** -- required for AI features (advisor, checklist generation)
- **Git**

## Local Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/Archigent.git
cd Archigent/frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:
- `NEXT_PUBLIC_SUPABASE_URL` -- from Supabase Dashboard > Settings > API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` -- from Supabase Dashboard > Settings > API
- `SUPABASE_SERVICE_ROLE_KEY` -- from Supabase Dashboard > Settings > API (keep secret)
- `OPENAI_API_KEY` -- from [OpenAI Platform](https://platform.openai.com/api-keys)

### 4. Set up database

Apply the SQL migration files in order via Supabase Dashboard > SQL Editor:

1. `.github/schema/archigent_schema.sql` -- Core tables (organisations, profiles, capabilities)
2. `.github/schema/governance_schema.sql` -- Governance tables (policies, reviews, decisions, ADRs)
3. `.github/schema/003_technology_domains.sql` through `009_condition_verification.sql` -- Incremental migrations

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register a new account -- the app will create your organisation automatically.

## Project Structure

```
frontend/
├── app/
│   ├── api/                    # API routes (46 endpoints with withAuth middleware)
│   │   ├── truly-govern/       # Governance API routes
│   │   └── ...                 # Core API routes
│   ├── truly-govern/           # Governance module pages
│   └── auth/                   # Auth callback for invite flow
├── components/
│   ├── truly-govern/           # Governance UI components (33 files)
│   │   ├── advisor/            # AI Governance Advisor
│   │   ├── reviews/            # Design review workflow
│   │   ├── decisions/          # Decision request management
│   │   ├── policies/           # Policy library
│   │   ├── patterns/           # Architecture patterns
│   │   ├── adrs/               # Architecture Decision Records
│   │   ├── deviations/         # Deviation register
│   │   └── shared/             # Shared components (sidebar, topbar)
│   └── ...                     # Core components (capability map, APM)
├── lib/
│   ├── truly-govern/           # Governance business logic (14 files)
│   │   ├── advisor-agent.ts    # AI advisor with RAG
│   │   ├── checklist-agent.ts  # Compliance checklist generator
│   │   ├── triage-agent.ts     # Decision routing AI
│   │   └── ...
│   ├── api-auth.ts             # withAuth middleware (RBAC + rate limiting)
│   └── supabaseAdmin.ts        # Admin database client
├── hooks/
│   └── useCurrentUser.ts       # Current user role hook
└── .env.example                # Environment variable template
```

## Code Style

- **TypeScript** -- strict mode enabled. All code must pass `npx tsc --noEmit`.
- **ESLint** -- run `npm run lint` before committing.
- **Tailwind CSS** -- use utility classes. Follow existing component patterns.
- **No `any`** -- avoid TypeScript `any` where possible. Use explicit types.
- **Imports** -- use `@/` path alias (e.g., `import { withAuth } from "@/lib/api-auth"`).

## Branch Naming

- `feat/description` -- new features
- `fix/description` -- bug fixes
- `docs/description` -- documentation changes
- `refactor/description` -- code refactoring

## Pull Request Process

1. Create an issue describing the change (bug or feature)
2. Create a branch from `main` using the naming convention above
3. Make your changes
4. Run `npx tsc --noEmit` to verify types
5. Run `npm run lint` to check code style
6. Submit a PR linking the issue
7. Describe what changed and why in the PR description
8. Wait for review

## Database Migrations

When adding or modifying database tables:

1. Create a new numbered SQL file in `.github/schema/` (e.g., `010_your_migration.sql`)
2. Use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for idempotency
3. Add RLS policies for new tables following the existing pattern in `governance_schema.sql`
4. Add appropriate indexes
5. Document the migration in your PR description

## API Routes

All API routes use the `withAuth` middleware:

```typescript
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (req, ctx) => {
  // ctx.user.id, ctx.orgId, ctx.role, ctx.token available
  return NextResponse.json({ data });
});

// Role-restricted endpoint
export const DELETE = withAuth(async (req, ctx) => {
  // Only owner/admin can reach this
  return NextResponse.json({ success: true });
}, { roles: ["owner", "admin"] });
```

## Questions?

Open a [GitHub Issue](https://github.com/santoshvelamuri/Archigent/issues) with the "question" label.
