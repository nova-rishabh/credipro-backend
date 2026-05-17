FROM node:20-alpine
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY contracts ./contracts
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8081
EXPOSE 8081

CMD ["node", "dist/server.js"]
