# Đo hiện trạng — Node 22 thuần, không thư viện (package.json không có dependencies), SQLite qua node:sqlite.
# Ghim bản: khi phát hành có thể ghi rõ node:22.x.y-alpine@sha256:… — đổi bản Node là việc có chủ ý (node:sqlite còn "experimental").
FROM node:22-alpine
ENV NODE_ENV=production PORT=3100 DATA_DIR=/data NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node vendor ./vendor
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/api/suc-khoe').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
