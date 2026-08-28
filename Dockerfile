# ===== 构建阶段 =====
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ===== 运行阶段 =====
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist

# 云托管默认期望容器监听 80 端口（也可在服务设置里改端口映射）
ENV PORT=80
EXPOSE 80

CMD ["node", "dist/main.js"]
