[English](#English) | [中文](#中文)

# English

# Contributing to Git City

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
git clone https://github.com/srizzon/git-city.git
cd git-city
npm install
cp .env.example .env.local
# Fill in your keys (see .env.example for details)
npm run dev
```

The app runs on [http://localhost:3001](http://localhost:3001).

## Requirements

- Node.js 18+
- A Supabase project (free tier works)
- A GitHub personal access token (for API calls)
- Stripe test keys (only if working on payments)

## Code Style

- TypeScript everywhere
- Tailwind CSS v4 for styling
- Pixel font (Silkscreen) for UI text
- React Three Fiber (R3F) + drei for 3D
- App Router (Next.js 16)

Run `npm run lint` before submitting.

## Making Changes

1. Fork the repo
2. Create a branch from `main` (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run `npm run lint` and fix any issues
5. Commit with a clear message (e.g. `feat: add rain weather effect`)
6. Open a Pull Request against `main`

## Commit Messages

Start with an emoji + type. Single line, present tense, concise.

| Emoji | Type | When |
|-------|------|------|
| ✨ | `feat` | New features |
| 🐛 | `fix` | Bug fixes |
| 📦 | `refactor` | Code restructuring |
| ✏️ | `docs` | Documentation |
| 💄 | `style` | Formatting, renaming |
| 🚀 | `perf` | Performance |
| 🚧 | `chore` | Maintenance |
| 🧪 | `test` | Tests |
| 🌐 | `i18n` | Internationalization |
| 📈 | `analytics` | Analytics |
| 🗃️ | `database` | Database changes |
| 🔧 | `ci` | CI/CD |
| 🏗️ | `build` | Build changes |
| ⏪️ | `revert` | Reverting commits |

**Examples:**

```
✨ feat(popover): add popover component
🐛 fix(command): resolve input focus issue
📦 refactor(command): improve component structure
🚧 chore: update dependencies
```

## Good First Issues

Look for issues labeled [`good first issue`](https://github.com/srizzon/git-city/labels/good%20first%20issue). These are scoped tasks that don't require deep knowledge of the codebase.

## Project Structure

```
src/
  app/          # Next.js App Router pages and API routes
  components/   # React components (UI + 3D)
  lib/          # Utilities, Supabase clients, helpers
  types/        # TypeScript types
public/         # Static assets (audio, images)
supabase/       # Database migrations
```

## 3D / Three.js

The city is rendered with React Three Fiber. Key files:

- `src/components/CityScene.tsx` - Main 3D scene
- `src/components/Building.tsx` - Individual building rendering
- `src/lib/zones.ts` - Item definitions for building customization

If you're adding a new building effect or item, start with `zones.ts`.

## Questions?

Open an issue or reach out on [X/Twitter](https://x.com/samuelrizzondev).

# 中文

# 贡献 Git City 项目
感谢你有兴趣为项目贡献力量！以下是参与贡献的入门指南。

## 环境搭建
```bash
git clone https://github.com/srizzon/git-city.git
cd git-city
npm install
cp .env.example .env.local
# 填写所需密钥（详见 .env.example 文件说明）
npm run dev
```
应用会运行在 http://localhost:3001 地址。

## 环境要求
- Node.js 18 及以上版本
- 一个 Supabase 项目（免费套餐即可满足需求）
- GitHub 个人访问令牌（用于 API 调用）
- Stripe 测试密钥（仅在开发支付功能时需要）

## 代码规范
- 全程使用 TypeScript 开发
- 样式采用 Tailwind CSS v4 实现
- UI 文本使用像素字体（Silkscreen）
- 3D 效果基于 React Three Fiber (R3F) + drei 开发
- 页面路由使用 Next.js 16 的 App Router
- 提交代码前必须执行：`npm run lint`（代码检查）

## 提交修改流程
1. Fork 本仓库
2. 基于 main 分支创建新分支（`git checkout -b feat/my-feature`）
3. 完成代码修改
4. 运行代码检查并修复所有问题：`npm run lint`
5. 提交代码并撰写清晰的提交信息（例如：`feat: add rain weather effect`）
6. 向 main 分支提交 Pull Request

## 提交信息规范
提交信息需以 **表情符号 + 类型** 开头，单行书写，使用现在时态，简洁明了。

| 表情 | 类型        | 使用场景                     |
|------|-------------|------------------------------|
| ✨   | feat        | 新增功能                     |
| 🐛   | fix         | 修复 Bug                     |
| 📦   | refactor    | 代码重构（无功能变更）       |
| ✏️   | docs        | 文档更新                     |
| 💄   | style       | 格式调整、变量/文件重命名    |
| 🚀   | perf        | 性能优化                     |
| 🚧   | chore       | 日常维护（依赖更新等）       |
| 🧪   | test        | 测试代码相关                 |
| 🌐   | i18n        | 国际化/本地化                |
| 📈   | analytics   | 数据分析/统计相关            |
| 🗃️   | database    | 数据库相关修改               |
| 🔧   | ci          | CI/CD 流程调整               |
| 🏗️   | build       | 构建流程/配置修改            |
| ⏪️   | revert      | 回滚提交                     |

### 示例：
- ✨ feat(popover): 添加弹出层组件
- 🐛 fix(command): 修复输入框聚焦问题
- 📦 refactor(command): 优化组件结构
- 🚧 chore: 更新项目依赖

## 新手友好任务
可以关注带有 `good first issue` 标签的任务，这类任务范围明确，无需深入了解整个代码库即可完成。

## 项目结构
```
src/
  app/          # Next.js App Router 页面和 API 路由
  components/   # React 组件（UI 组件 + 3D 组件）
  lib/          # 工具函数、Supabase 客户端、辅助方法
  types/        # TypeScript 类型定义
public/         # 静态资源（音频、图片）
supabase/       # 数据库迁移文件
```

## 3D / Three.js 相关说明
城市的 3D 渲染基于 React Three Fiber 实现，核心文件如下：
- `src/components/CityScene.tsx` - 主 3D 场景
- `src/components/Building.tsx` - 单个建筑的渲染逻辑
- `src/lib/zones.ts` - 建筑自定义道具的定义文件

如果要新增建筑特效或自定义道具，建议先从 `zones.ts` 文件入手。

## 有问题？
可直接提交 Issue，或通过 X/Twitter 联系项目维护者。

### 总结
1. 贡献前需搭建符合要求的开发环境，确保 Node.js 版本、Supabase 等依赖配置正确；
2. 代码需遵循 TypeScript、Tailwind CSS v4 等规范，提交前必须执行 `npm run lint`；
3. 提交信息需按「表情+类型+描述」的格式编写，新手可优先选择 `good first issue` 标签的任务。
