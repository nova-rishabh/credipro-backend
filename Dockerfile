# syntax=docker/dockerfile:1
# Build from repo root: docker compose build backend
FROM node:22-alpine AS base
WORKDIR /app

# Layer 1: deps (cached until package files change)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

RUN --mount=type=cache,target=/root/.npm \
    npm ci -w backend

# Layer 2: source + compile (cached until code changes)
COPY backend ./backend
COPY contracts ./contracts

RUN npm run build -w backend

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server.js"]
