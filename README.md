<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/barkat-logo-dark.svg">
    <img src="branding/barkat-logo.svg" alt="Barkat" height="64">
  </picture>
</p>

# Barkat

Self-hosted tracker for household bills, income and the cushion left over, updated week by week. A fast, open-source replacement for a monthly bill-tracking spreadsheet.

> **Why "Barkat"?** *Barkat* (برکت · बरकत) is Urdu and Hindi for blessing and abundance: the quiet sense that what you have is enough, and that careful keeping of it helps it grow. That is the idea behind the app.

> **Built with AI, under supervision.** Barkat is vibe coded: most of the code is written by Claude (Anthropic's AI) from my instructions. I direct the work, review the code and the changes, and run the tests before anything ships, but it has not had an independent audit. It handles financial figures, so check the numbers against your own records before you rely on it, and use it at your own risk. Commits made with Claude's help carry a `Co-Authored-By` line.

> **Status: early development.** Sign-in, books, the weekly screen and the new-month copy work. See the roadmap below.

## What it is for

Each month you copy last month's sheet, then each week you update the expenses, the payment status and your notes, and the totals work themselves out. Barkat keeps that workflow and removes the copying:

- **Bills** with a due day, a projected amount and a status: `None`, `Pending`, `Payment Made`, `Paid`.
- **Ad-hoc payments** for one-off money out, such as a principal-only mortgage payment, zakat or a trip. They come out of the same account and cushion as bills, and can be tagged and totalled on their own.
- **Accounts**: every bill, one-off and income row says which account it comes from or goes into, so a household with several accounts (or a book for someone else's accounts) stays accurate. An "Accounts" card shows each account's balance and cushion.
- **Income** with a `Pending` or `Received` status, plus **income schedules**: set a paycheck to repeat weekly, every two weeks or monthly and each month fills in its paydays (a biweekly check lands two or three times a month, as it does in real life).
- **Bank balances** and a **cushion**: what is left once pending income arrives and every outstanding bill is paid, labelled *Saving* or *Debt*.
- **A dashboard** for each month: the cushion up front, key numbers (paid so far, income received, next due bill, share saved), charts of spending by status, money in and out, largest payments and one-offs by tag, and a trend of income and spending across months.
- **Full backup and restore**: download a whole book as one JSON file and recreate it as a new book in this or another Barkat, with balances exactly as they were.
- **Excel import and export**: bring in a workbook with one sheet per month (the original layout), and export every month back out in that same layout, formulas included, so the file still calculates in Excel.
- **Light and dark mode**, or follow your system. Your choice is remembered in the browser.
- **Separate books** for the household, for family members whose books you keep, and for your own.
- **New month in one click**: last month's bills copied forward with amounts reset, and income filled from the schedules.

## Roadmap

- [x] Project scaffold, Docker image, compose files, CI
- [x] Budget formulas as tested pure functions
- [x] Database (SQLite) and books
- [x] Weekly screen: bills, one-off payments, income, banks, cushion
- [x] New month copy
- [ ] Yearly repeat for one-offs such as zakat
- [x] Excel import and export (one sheet per month)
- [x] Full book backup and restore (JSON)
- [x] Sign-in, roles (admin, viewer) and a navigation bar
- [ ] Personal tracking in a "Me" book

## Run it

You need Docker with Compose.

```bash
cp .env.example .env
docker compose up -d
```

The app is at http://localhost:3040 (`BARKAT_PORT`). Data lives in `./data`, which is git-ignored. Back it up like any other folder.

### First sign-in

There is no default login. On first start Barkat prints a one-time setup code to the server log:

```bash
docker logs barkat 2>&1 | grep -i "setup code"
```

Open the app, enter the code, and create the admin account. There is no self-registration; admins add more people on the **Users** page.

- **Admin**: edits everything and manages users.
- **Viewer**: sees the books, cannot change them. Good for a family member who only checks.

Sessions last 7 days, and sign-in attempts are rate limited. Put HTTPS in front of it when exposing it beyond your network, and set `BARKAT_BASE_URL` and `BARKAT_COOKIE_SECURE` (see `.env.example`).

Build from source instead of pulling the published image:

```bash
make dev
```

Images are published to `ghcr.io/elekib/barkat` for `linux/amd64` and `linux/arm64`.

## Develop

Node 22+ is needed for local checks.

```bash
cd web
npm ci
npm run dev        # dev server on :3000
npm run typecheck
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## Privacy

Barkat stores your data only in `./data` on your own server. It sends nothing anywhere. Never commit `data/`, `.env` or real spreadsheets; the repository's `.gitignore` and a secret scan in CI help guard against it.

## License

[Apache License 2.0](LICENSE).
