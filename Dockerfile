# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY contracts ./contracts
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server.js"]
