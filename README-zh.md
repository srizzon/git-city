<h1 align="center">Git City</h1>

<p align="center">
  <strong>把你的 GitHub 个人主页变成一座可交互 3D 像素城市里的专属建筑。</strong>
</p>

<p align="center">
  <a href="https://thegitcity.com">thegitcity.com</a>
</p>

<p align="center">
  <img src="public/og-image.png" alt="Git City — 代码构筑城市" width="800" />
</p>

---

语言：[English](README.md) | 中文

## 什么是 Git City？

Git City 会将每个 GitHub 用户转换成一栋独一无二的像素艺术建筑。你的贡献越多，建筑就越高。你可以在可交互的 3D 城市中自由探索、在建筑间飞行，并发现来自世界各地的开发者。

## 功能特性

- **3D 像素艺术建筑**
  每个 GitHub 用户对应一栋建筑：高度由贡献量决定，宽度由仓库数量决定，亮灯的窗户代表活跃度。

- **自由飞行模式**
  通过流畅的相机控制在城市中飞行，访问任意建筑，欣赏城市天际线。

- **个人主页**
  为每位开发者生成专属页面，展示数据统计、成就和热门仓库。

- **成就系统**
  根据代码贡献、星标数、仓库数、邀请好友等解锁各类成就。

- **建筑自定义**
  认领你的建筑，并在商店中购买道具进行装饰：皇冠、光环、屋顶特效、外立面装饰等。

- **社交功能**
  发送点赞、赠送道具、邀请好友，还能查看实时动态。

- **对比模式**
  将两位开发者并排展示，对比他们的建筑与数据。

- **分享卡片**
  下载可分享的个人主页图片卡片，支持横版和故事版格式。

<!-- TODO: 添加截图 -->
<!-- ![城市概览](assets/screenshot-city.png) -->
<!-- ![个人主页](assets/screenshot-profile.png) -->
<!-- ![对比模式](assets/screenshot-compare.png) -->

## 建筑生成规则

| 数据指标       | 影响内容         | 示例说明                              |
|----------------|------------------|---------------------------------------|
| 贡献次数       | 建筑高度         | 1000 次提交 → 建筑更高                |
| 公共仓库数     | 建筑宽度         | 仓库越多 → 建筑基座更宽               |
| 星标数         | 窗户亮度         | 星标越多 → 更多窗户亮起               |
| 活跃度         | 窗户图案         | 近期活跃 → 独特的发光样式             |

建筑使用实例化网格与 LOD（细节层次）系统渲染以保证性能：近距离建筑展示完整细节与动画窗户，远距离建筑使用简化几何体。

## 技术栈

- **框架：** [Next.js](https://nextjs.org) 16（App Router、Turbopack）
- **3D 引擎：** [Three.js](https://threejs.org)，基于 [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) + [drei](https://github.com/pmndrs/drei)
- **数据库与认证：** [Supabase](https://supabase.com)（PostgreSQL、GitHub OAuth、行级权限）
- **支付：** [Stripe](https://stripe.com)
- **样式：** [Tailwind CSS](https://tailwindcss.com) v4 + 像素字体（Silkscreen）
- **部署：** [Vercel](https://vercel.com)

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/srizzon/git-city.git
cd git-city

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 填写 Supabase 和 Stripe 密钥

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3001](http://localhost:3001) 即可查看城市。

## 开源协议

[AGPL-3.0](LICENSE) — 你可以使用和修改 Git City，但任何公开部署都必须开源对应的代码。

---

<p align="center">
  作者：<a href="https://x.com/samuelrizzondev">@samuelrizzondev</a>
  汉化贡献：<a href="https://github.com/EndlessPixel">@EndlessPixel</a>
</p>