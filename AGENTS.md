# AGENTS.md

> 本文件面向 AI 编程助手，用于快速了解 `outu-server` 项目的结构、约定与运行方式。

## 项目概述

`outu-server` 是「鸥途」应用的后端服务，基于 **NestJS**（Node.js / TypeScript）构建。

当前核心能力：

- 提供 `POST /api/plan/generate` 接口，根据用户提交的旅行需求调用大语言模型生成完整旅行方案。
- 旅行方案包含：全局信息（标题、城际/市内交通、住宿、预算、实用信息）以及按天拆分的行程节点。
- 通过并发调用 LLM 生成多天行程，缩短响应时间。

## 技术栈

- **运行时**：Node.js 20
- **框架**：NestJS 10.x（平台 Express）
- **语言**：TypeScript 5.4.x
- **开发工具**：`ts-node` 本地运行
- **AI 编排**：LangChain（`langchain` + `@langchain/openai`，`createAgent` 封装提示词与模型）
- **部署方式**：Docker 容器化（`node:20-alpine` 多阶段构建）
- **对外协议**：HTTP RESTful JSON

## 项目结构

```text
outu-server/
├── src/
│   ├── main.ts              # 应用入口，创建 Nest 应用并监听端口
│   ├── app.module.ts        # 根模块，目前仅导入 PlanModule
│   └── plan/                # 旅行方案生成模块
│       ├── plan.module.ts   # Plan 模块定义
│       ├── plan.controller.ts # /api/plan 路由及鉴权
│       ├── plan.service.ts  # 方案编排：并发调用 Agent 并组装最终 TravelPlan
│       └── travel-plan.agent.ts # LangChain Agent：封装模型配置与全部提示词
├── dist/                    # TypeScript 编译输出（运行产物）
├── .env.example             # 环境变量示例
├── .env                     # 本地环境变量（不提交）
├── tsconfig.json            # TypeScript 配置
├── package.json             # 依赖与 npm 脚本
├── Dockerfile               # 多阶段构建镜像
├── .gitignore               # Git 忽略规则
└── .dockerignore            # Docker 构建上下文忽略规则
```

### 模块说明

- `AppModule`：根模块，负责聚合子模块。
- `PlanModule`：当前唯一的业务模块，包含控制器、服务与 Agent。
  - `PlanController`：定义 `/api/plan/generate` 接口，负责鉴权和参数校验。
  - `PlanService`：方案编排层——按天并发调用 Agent（1 个全局信息 + N 个单日行程），组装最终 `TravelPlan`。
  - `TravelPlanAgent`：基于 `langchain` 的 `createAgent` 封装模型（ChatOpenAI 指向 Moonshot / Kimi 兼容端点）、系统提示词 `CORE_PRINCIPLES` 与 JSON Schema 提示词；`askJson()` 负责调用并解析 JSON。

## 环境变量

本地开发需复制 `.env.example` 为 `.env` 并填写真实值：

| 变量名       | 说明                                    | 默认值                        |
| ------------ | --------------------------------------- | ----------------------------- |
| `LLM_API_KEY` | 大模型 API Key，必填                     | -                             |
| `LLM_BASE_URL` | Chat Completions 接口地址               | `https://api.moonshot.cn/v1`  |
| `LLM_MODEL`   | 模型 ID                                  | `kimi-k2.6`                   |
| `PORT`        | 服务监听端口（本地 dev）                 | `3100`                        |
| `API_TOKEN`   | 可选的接口访问令牌，配置后需校验         | -                             |

生产环境（Docker）默认 `PORT=80`。

## 构建与运行

### 本地开发

```bash
# 安装依赖
npm install

# 复制并填写环境变量
cp .env.example .env

# 本地热运行（使用 ts-node + dotenv）
npm run dev
```

本地默认监听 `http://127.0.0.1:3100`。

### 编译

```bash
npm run build
```

输出到 `dist/`。

### 生产启动

```bash
npm start
# 等价于 node dist/main.js
```

### Docker

```bash
docker build -t outu-server .
docker run -p 80:80 -e LLM_API_KEY=xxx outu-server
```

Dockerfile 使用多阶段构建：

1. `builder` 阶段安装全部依赖并编译 TypeScript。
2. 运行阶段仅复制 `package.json` 与生产依赖，再复制 `dist/` 产物。

## 接口约定

### POST /api/plan/generate

生成旅行方案。

**请求头**

- `x-outu-token`：当配置了 `API_TOKEN` 时必填，用于接口鉴权。

**请求体**

```json
{
  "request": {
    "request_id": "uuid",
    "destinations": ["目标城市/景点"],
    "travel_dates": {
      "departure_date": "2026-08-20",
      "total_days": 3
    },
    "travelers": { ... },
    "budget": { ... },
    "preferences": { ... },
    "special_requests": "..."
  }
}
```

**响应**

成功：

```json
{
  "plan": {
    "plan_id": "...",
    "request_id": "...",
    "generated_at": "2026-08-13T...",
    "summary": { ... },
    "daily_plans": [ ... ],
    "transportation": { ... },
    "accommodation": [ ... ],
    "budget_breakdown": { ... },
    "practical_info": { ... }
  }
}
```

失败：

```json
{
  "plan": null,
  "error": "错误信息"
}
```

## 代码风格约定

- 使用 TypeScript，单引号字符串，末尾不加分号（项目当前风格）。
- 装饰器/类风格：遵循 NestJS 标准（`@Module`、`@Controller`、`@Injectable`）。
- 私有方法命名：`private methodName()`。
- 环境变量优先读取 `process.env.*`，无默认值时给出明确错误提示。
- 核心提示词常量集中在 `travel-plan.agent.ts`，使用大写下划线命名，如 `CORE_PRINCIPLES`、`SCHEDULE_SCHEMA`、`GLOBAL_SCHEMA`。
- LLM 响应通过正则提取第一个 `{ ... }` 块并 `JSON.parse`（在 `TravelPlanAgent.extractJson` 中）。

## 测试

当前项目尚未配置测试框架与测试脚本。

如后续引入，建议按 NestJS 惯例使用 `jest`：

```bash
npm install --save-dev @nestjs/testing jest @types/jest
```

并新增 `test/` 目录，为 `PlanController` 与 `PlanService` 编写单元测试。

## 安全与部署注意事项

- `.env` 与 `dist/`、`*.log` 已加入 `.gitignore` 与 `.dockerignore`，切勿提交密钥。
- `API_TOKEN` 为可选鉴权；未配置时接口可直接访问，仅适合内部/本地调试。
- `LLM_API_KEY` 必须配置，否则接口会返回 `LLM_API_KEY 未配置` 错误。
- LLM 请求超时约 280 秒（`TravelPlanAgent` 中 `ChatOpenAI` 的 `timeout: 280_000`），调用方需设置较长的读取超时。
- `app.enableCors()` 已开启，便于本地 H5 页面调试；小程序端不受 CORS 限制。
- Docker 镜像默认监听 `80` 端口，适合多数云托管平台的默认端口期望。

## 扩展提示

- 新增业务模块时，参考 `plan/` 目录结构：新建 `xxx.module.ts`、`xxx.controller.ts`、`xxx.service.ts`，并在 `app.module.ts` 的 `imports` 中注册。
- 若接入数据库、缓存或消息队列，请先确认项目是否已依赖相关包，再修改 `package.json` 与模块 Provider。
