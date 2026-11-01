# SYM: build the web app, then run the API with nothing but Node (no runtime dependencies).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps: npm 10 crashes resolving Vitest's optional peers (see README)
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts/backup.mjs ./scripts/backup.mjs
COPY package.json ./
RUN rm -f server/*.test.mjs && mkdir -p /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8787 SYM_DB=/data/sym.db
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "server/index.mjs"]
