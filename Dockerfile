# SoloPulse — Next.js HTTP + WebSocket /ws (Railway)
FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY package.json package-lock.json ./
# npm install (not ci): lock regenerated after dep cleanup; more resilient on Railway
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "server.mjs"]
