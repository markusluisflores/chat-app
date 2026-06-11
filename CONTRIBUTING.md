# Contributing to chat-app

## Development Setup

```bash
git clone https://github.com/markusluisflores/chat-app.git
cd chat-app
npm install
npm run dev
```

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials.

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<description>` | `feat/dark-mode` |
| Bug fix | `fix/<description>` | `fix/presence-sync` |
| Docs | `docs/<description>` | `docs/api-reference` |
| Chore | `chore/<description>` | `chore/update-deps` |

## Workflow

1. Branch from `main` — never commit directly to `main`
2. Write or update tests for any logic changes
3. Run `npm run test:run` — all tests must pass before opening a PR
4. Open a PR using the provided template — fill in all sections
5. CI must be green before merge

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add message read receipts
fix: correct presence channel teardown on unmount
docs: update README with setup steps
chore: update Supabase SSR to v0.11
```

## Bug Reports

See [SECURITY.md](SECURITY.md) for security vulnerabilities.
For all other bugs, use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) issue template.
Only file a bug if the defect was found after merge to main or a release — catch-during-development issues are fixed inline.

## Feature Requests

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) issue template.
