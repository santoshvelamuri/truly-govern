# Changelog

All notable changes to Archigent will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT License for open-source distribution
- BYOK LLM support via `OPENAI_BASE_URL` (Azure OpenAI, Ollama, Together AI, Groq, Mistral)
- Comprehensive documentation: README, CONTRIBUTING, ARCHITECTURE, API, DATABASE, DEPLOYMENT
- Test suite: 154 tests across 18 suites (Jest + ts-jest + @testing-library/react)
- `withAuth` middleware with RBAC and rate limiting for all 46 API routes
- Role-based UI: admin-only buttons hidden for member/viewer roles
- `useCurrentUser` hook for frontend role detection
- Security headers (X-Frame-Options, X-Content-Type-Options, CSP, etc.)
- `.env.example` environment variable template
- Dockerfile with multi-stage build and health check
- Docker Compose for local development with PostgreSQL + pgvector
- GitHub Actions CI pipeline (lint, typecheck, test, build)
- Release automation on tag push
- Database migration runner script
- Health check endpoint (`/api/health`)
- Self-service signup with auto org creation
- Auth callback for invite email flow + set password screen
- User name display in header
- Open-source backlog tracking (`.github/backlog/`)

### Changed
- Design review workflow: self-assessment + reviewer assignment flow
- Follow-ups tab combining conditions and waivers
- Deviations page redesign with My/All scope toggle
- Decision requests with ARB board column and filtering
- Policy import with AI-enhanced preview and clauses

## [0.1.0] - 2026-04-14

### Added
- Initial release
- Capability Map with multi-level domain organisation
- Application Portfolio Management
- Strategic Initiatives with capability linking
- Truly Govern governance module:
  - Policy library with AI extraction and ingestion
  - AI Governance Advisor with policy and ADR citation
  - Design reviews with AI compliance checklists
  - Decision requests with ARB board routing
  - ADR library with AI-suggested rationale
  - Architecture pattern library
  - Deviation register with debt scoring
  - Notification system
