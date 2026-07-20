FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node config.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node data ./data

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
