# Study English · 每日英语教练

按 PRD 落地：家长排课后台 + 孩子平板每日闭环学习，支持真实 AI 外教接入。

## 功能

- 家长：资料库上传、日历排课、学习报告、AI 状态查看
- 孩子：预习 → AI 外教三阶段 → 听力阶梯 → 裸听 → 早餐巩固
- AI（可选，默认对接阿里云百炼）：
  - LLM（`qwen-plus`）：纠音 / 复述评判 / 主题问答
  - ASR（`qwen3-asr-flash`）：云端录音转写
  - TTS（`cosyvoice-v3-flash` / `longxiaochun_v3`）：云端带读（失败回退浏览器语音）
- 无 Key 时自动回退本地规则引擎

## 技术栈

- Next.js App Router
- Prisma + **PostgreSQL**（推荐 Prisma Postgres）
- 上传：**Vercel Blob**（本地无 Token 时回退 `public/uploads`）
- OpenAI 兼容 API（LLM / Whisper / TTS）

## 本地开发

1. 复制环境变量：

```bash
copy .env.example .env
```

2. 填入 PostgreSQL 连接串 `DATABASE_URL`（见下方「部署到 Vercel」第 1 步）。

3. 安装并初始化：

```bash
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

打开 http://localhost:3000

- 孩子端：`/child`
- 家长端：`/parent`

可选：配置百炼 `AI_API_KEY` 后重启；打开 `/api/ai/status` 可看 LLM / ASR / TTS 是否启用。

## 部署到 Vercel（推荐路径）

### 1. 创建云数据库（Prisma Postgres）

1. 打开 [Prisma Console](https://console.prisma.io) 注册/登录  
2. 新建 Project → 创建 Postgres 数据库（选离你近的区域，如 `ap-southeast-1`）  
3. 复制 **Direct connection** 连接串（`postgresql://...`）  
4. 粘贴到本地 `.env` 的 `DATABASE_URL=`

本地执行一次：

```bash
npx prisma migrate deploy
npm run db:seed
```

### 2. 推到 GitHub

在 GitHub 新建空仓库，然后：

```bash
git add .
git commit -m "Ready for Vercel: Postgres + Blob"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

确认 `.env` 未被提交（已在 `.gitignore`）。

### 3. Vercel 导入项目

1. 打开 [Vercel](https://vercel.com) → **Add New… → Project**  
2. 导入刚才的 GitHub 仓库  
3. Framework 选 Next.js（一般自动识别）  
4. **Environment Variables** 添加（Production / Preview 都勾上）：

| Name | Value |
|------|--------|
| `DATABASE_URL` | Prisma Postgres 连接串 |
| `AI_API_KEY` | 你的 Key |
| `AI_BASE_URL` | 如 `https://api.openai.com/v1` |
| `AI_MODEL` | 如 `gpt-4o-mini` |
| `AI_TRANSCRIBE_MODEL` | `whisper-1`（可选） |
| `AI_TTS_MODEL` | `tts-1`（可选） |
| `AI_TTS_VOICE` | `nova`（可选） |

5. 点 **Deploy**，等构建成功

### 4. 创建 Vercel Blob（上传音视频）

1. 在该 Vercel 项目 → **Storage** → **Create** → **Blob**  
2. 选 **Public** 访问（方便平板直接播音频）  
3. 连接到当前项目后，Vercel 会自动注入 `BLOB_READ_WRITE_TOKEN`  
4. **Redeploy** 一次，让上传走云端

本地若也要上传到 Blob：

```bash
npx vercel link
npx vercel env pull .env.local
```

### 5. 孩子平板怎么用

部署成功后地址类似：`https://你的项目.vercel.app`

- 孩子：`https://你的项目.vercel.app/child`  
- 家长：`https://你的项目.vercel.app/parent`  

在华为浏览器打开孩子端 → 菜单 → **添加到主屏幕**，即可当 App 用。

## 配置真实 AI（百炼）

```env
AI_API_KEY=sk-xxx
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
AI_TRANSCRIBE_MODEL=qwen3-asr-flash
AI_TTS_MODEL=cosyvoice-v3-flash
AI_TTS_VOICE=longxiaochun_v3
AI_AUDIO_ENABLED=true
```

> CosyVoice TTS 当前主要在华北2（北京）可用。若合成失败，带读会自动回退浏览器语音。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run db:deploy` | 对当前 `DATABASE_URL` 执行迁移 |
| `npm run db:seed` | 写入示范资料与今日任务 |
| `npm run build` | 生产构建（含 migrate deploy） |
| `npm run start` | 启动生产服务 |

## 需求文档

见 [`docs/PRD-儿童英语每日学习系统.md`](docs/PRD-儿童英语每日学习系统.md)。
