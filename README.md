# Truly Govern

**Open-source AI-augmented architecture governance platform**

Truly Govern provides structured governance across seven stages: Define, Consult, Review, Decide, Record, Build, and Comply. It replaces ad-hoc governance processes with a unified digital platform that embeds governance into daily architecture workflows.

## Features

- **Policy Library** — Author, import, and manage architecture standards with AI-powered extraction from PDFs
- **AI Governance Advisor** — Ask governance questions in plain English with cited, policy-grounded answers
- **Design Reviews** — Self-assessment + reviewer workflow with AI-generated compliance checklists
- **Decision Requests** — Route architecture decisions through domain or enterprise ARB boards
- **ADR Library** — Architecture Decision Records with AI-suggested rationale
- **Pattern Library** — Reusable architecture patterns with policy coverage scoring
- **Deviation Register** — Track waivers, conditions, and exceptions with debt scoring
- **Notifications** — In-app alerts for reviews, decisions, conditions, and deadlines

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4
- **Backend**: Next.js API Routes with Supabase PostgreSQL
- **AI**: OpenAI (GPT-4o) — configurable via `OPENAI_BASE_URL` for Azure, Ollama, Together AI, or any OpenAI-compatible provider
- **Auth**: Supabase Auth with JWT, multi-tenancy via Row-Level Security
- **Search**: pgvector for semantic policy and ADR retrieval

## Quick Start

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) account (free tier works)
- OpenAI API key (for AI features)

### Setup

```bash
# Clone the repository
git clone https://github.com/santoshvelamuri/truly-govern.git
cd truly-govern

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase and OpenAI credentials

# Run database migrations
# Apply SQL files from schema/ in your Supabase SQL Editor
# Start with 001_core.sql, then 002_governance.sql, then 003-009 in order

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access Truly Govern.

### Using Your Own LLM Provider

Set `OPENAI_BASE_URL` in `.env.local` to point to any OpenAI-compatible endpoint:

```env
# Azure OpenAI
OPENAI_BASE_URL=https://your-instance.openai.azure.com

# Ollama (local)
OPENAI_BASE_URL=http://localhost:11434/v1

# Together AI
OPENAI_BASE_URL=https://api.together.xyz/v1
```

### Docker

```bash
docker compose up
```

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Database Schema](docs/DATABASE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Governance Capabilities](docs/GOVERNANCE_CAPABILITIES.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## Integration with Archigent

Truly Govern can run standalone or integrate with [Archigent](https://github.com/santoshvelamuri/Archigent) for capability mapping, application portfolio management, and strategic initiatives. When integrated, governance domains link to Archigent capability domains, and reviews/decisions can reference applications and initiatives.

## Security

- Centralized `withAuth` middleware with JWT validation and RBAC
- Role-based access: owner, admin, member, viewer
- Rate limiting: 100 req/min (default), 10 req/min (AI routes)
- Row-Level Security (RLS) on all database tables
- Multi-tenancy isolation via `org_id` enforcement

## License

[MIT](LICENSE)
