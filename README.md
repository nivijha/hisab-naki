# HisabNaki

HisabNaki is a voice-first digital ledger built for small Indian shopkeepers. It uses a microphone-first flow, natural-language transcript parsing, and a deterministic backend ledger so that financial records are stored in PostgreSQL and calculated without LLM magic.

## Stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: Node.js, TypeScript, Express.js
- Database: PostgreSQL + Prisma
- AI: Gemini intent extraction for transcript interpretation only

## Features

- Voice recording via browser Web Speech API
- Structured intent parsing for ledger commands
- Confirmation before saving financial changes
- Deterministic outstanding balance calculation
- Dashboard summary for sales, expenses, payments, and outstanding credit
- Customer and transaction APIs

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a PostgreSQL database named `hisabnaki`, then copy `.env.example` to `.env` and update its connection string if needed:

```bash
Copy-Item .env.example .env
```

3. Generate Prisma client and run the schema (migrations are the source of truth; run them, not `db push`):

```bash
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma
npm run prisma:seed
```

4. Run the backend:

```bash
npm run dev --workspace backend
```

5. Run the frontend:

```bash
npm run dev --workspace frontend
```

6. Open http://localhost:3000

## Demo flow

Try the flow:

- “Raju ko 450 rupaye ka samaan udhaar diya.”
- “Raju ka kitna udhaar hai?”
- “Raju ne 200 rupaye de diye.”

## Environment variables

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hisabnaki?schema=public"
GEMINI_API_KEY=""
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

## Notes

- AI is used only to interpret language into a structured command.
- The backend owns financial truth and database writes.
- PostgreSQL is the source of truth for balances.
