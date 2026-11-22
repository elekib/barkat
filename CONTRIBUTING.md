# Contributing to Barkat

Thanks for helping. Bug reports, fixes and docs are all welcome.

## Ground rules

- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).
- Never commit `data/`, `.env`, real spreadsheets or anything with real names, balances or account numbers. Use made-up sample data.

## Developer Certificate of Origin

Contributions are accepted under the [DCO](https://developercertificate.org/). Sign every commit with `-s`:

```bash
git commit -s -m "Describe your change"
```

CI rejects pull requests with unsigned commits. To fix a branch: `git rebase --signoff main`.

Contributions are licensed under the [Apache License 2.0](LICENSE), the same as the project.

## AI-assisted code

Much of this project is written with Claude under the maintainer's supervision and review. Commits it helped write end with a `Co-Authored-By: Claude …` line, and are still signed off (`-s`) by the human who reviewed them. If you use an AI tool for a contribution, say so in the pull request and make sure you have read and tested what you submit.

## Development setup

```bash
cd web
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Tests live in `web/__tests__/`, mirroring `web/src/`.

## Pull requests

1. Fork the repository and branch from `main`.
2. Keep changes focused. Add or update tests when you change behavior.
3. Make sure typecheck, tests and build pass in `web/`.
4. Open a pull request describing the change and how you tested it.

## Releases

1. Move `[Unreleased]` in `CHANGELOG.md` to `[X.Y.Z] - YYYY-MM-DD`.
2. Set the version in `web/package.json`.
3. Commit with sign-off, tag `vX.Y.Z` on `main`, push the tag. The Publish workflow pushes the images and creates the GitHub release. Tags containing `-` are prereleases and do not move `latest`.
