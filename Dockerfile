# SoloPulse — Next.js HTTP + WebSocket /ws (Railway)
FROM node:20-bookworm-slim
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install ALL deps (including typescript/tailwind) for build
# NODE_ENV must NOT be production during install/build or npm skips devDeps
COPY package.json package-lock.json ./
RUN npm install --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

# Runtime only
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "server.mjs"]
