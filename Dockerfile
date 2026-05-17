FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

RUN npm ci

COPY backend ./backend
COPY contracts ./contracts

RUN npm run build -w backend

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

RUN npm ci -w backend --omit=dev

COPY --from=build /app/backend/dist ./backend/dist
COPY contracts ./contracts

WORKDIR /app/backend

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
