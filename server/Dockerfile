# Prototype image: runs TypeScript directly via tsx, pushes the schema and
# seeds demo data (only when the DB is empty) on startup.
# Debian-slim (not alpine): Prisma's engines need OpenSSL/glibc.
FROM node:20-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --skip-generate && SEED_IF_EMPTY=1 npx tsx prisma/seed.ts && npx tsx src/index.ts"]
