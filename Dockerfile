FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "server.mjs"]
