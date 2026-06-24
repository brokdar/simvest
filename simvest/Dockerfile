# syntax=docker/dockerfile:1.7
# Multi-stage build producing a standalone Next.js server bundle.

FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3 needs Python + build tools to compile its native binding.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=/app/data/simvest.db

RUN apk add --no-cache libstdc++ \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /app/data \
 && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Remove any DB written during next build's SSG phase so the image starts clean.
RUN rm -rf /app/data && mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "--optimize-for-size", "server.js"]
