FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

RUN apk add --no-cache docker-cli

# Ensure execution mount-point exists even if volume is not attached
RUN mkdir -p /execution

COPY src ./src

CMD ["node", "src/index.js"]
