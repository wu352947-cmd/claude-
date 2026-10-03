# 拾光手帐 · 生产镜像（零 npm 依赖；如使用 Claude 回信需另装 @anthropic-ai/sdk）
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package.json ./
COPY server ./server
COPY public ./public
RUN addgroup -S sg && adduser -S sg -G sg && mkdir -p /data && chown sg:sg /data
USER sg
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
