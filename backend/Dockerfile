# UpworkRadar backend — Node + TypeScript + Prisma
FROM node:22-alpine

# Prisma needs OpenSSL at runtime on Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies (cached when manifests are unchanged).
COPY package*.json ./
RUN npm install

# Copy source and build (npm run build runs `prisma generate && tsc`).
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

# Apply migrations on boot, then start the compiled server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
