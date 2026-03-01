FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

RUN apk add --no-cache docker-cli

COPY src ./src

CMD ["node", "src/index.js"]
