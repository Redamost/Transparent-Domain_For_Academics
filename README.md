# 透明领域 (TransparentDomain)

> 天上有行云，人在行云里。 —— 九天科技解构平台

**透明领域**是一个学术研究者透明度与公信力评价平台。通过对研究者进行多维度评分、构建学术圈层（领域/机构/地域）、集成 arXiv 论文动态，建立一个公开、可追溯、可验证的学术信誉体系。

## ✨ 核心功能

### 🔍 研究者评价系统
- **多维度评分** —— 覆盖研究质量、学术诚信、产出效率等多个评分维度，加权合成综合分数
- **时间衰减机制** —— 评分随时间衰减，近期的举报和评价具有更高权重，确保评分的时效性
- **评分历史追溯** —— 完整的评分变动日志（RatingLog），每次评分变更均可审计
- **评分分解展示** —— 每位研究者可查看各维度的得分明细

### 📊 研究领域体系
- **学科领域树** —— 层级化的学科分类，覆盖 AI/机器学习、物理学、生物学、计算机科学等
- **arXiv 类别映射** —— 学科领域与 arXiv 分类体系自动关联，实时拉取最新论文
- **热门领域排行** —— 首页展示热门研究领域及活跃研究者

### 🌐 学术圈（Circles）
- **三维透视** —— 按领域、机构、地域三个维度组织研究者群体
- **学术势力地图** —— 每个圈子展示成员数量、平均评分、代表人物
- **圈层详情** —— 圈层内研究者排行与分布

### 📝 举报审核系统
- **公开举报** —— 用户可提交针对研究者的举报（如学术不端、数据造假等），附带证据
- **审核流程** —— PENDING → UNDER_REVIEW → APPROVED / REJECTED 完整审批链
- **评分联动** —— 审核通过的举报自动影响被举报者的评分（按类别扣分）

### 📡 arXiv 研究动态
- **研究者论文追踪** —— 按作者名自动检索 arXiv 最新预印本
- **领域论文订阅** —— 按学科领域拉取最新论文
- **个性化动态流** —— 生成个性化的研究更新 Feed

### 🌍 国际化
- **中英双语** —— 完整支持中文（zh）和英文（en）两种语言
- **本地化路由** —— `/[locale]/...` 路由结构，自动语言检测

### 🛡️ 安全
- **JWT 认证** —— 基于 NextAuth 的邮箱密码登录，支持邮箱验证
- **安全响应头** —— 内置安全头配置（CSP、HSTS 等）
- **API 校验** —— 基于 Zod 的请求参数校验体系

## 🛠 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | Next.js 16、React 19 |
| **语言** | TypeScript |
| **数据库** | PostgreSQL + Prisma 7 |
| **认证** | NextAuth 4 (Credentials + JWT) |
| **样式** | Tailwind CSS 4、玻璃拟态效果 |
| **状态管理** | TanStack React Query |
| **图表** | Recharts |
| **国际化** | next-intl 4 |
| **校验** | Zod 4 |
| **测试** | Vitest + Playwright |

## 📁 项目结构

```
transparent-domain/
├── prisma/                     # 数据库 Schema 与迁移
│   ├── schema.prisma
│   └── migrations/
├── public/locales/             # i18n 翻译文件
│   ├── zh/common.json
│   └── en/common.json
├── src/
│   ├── app/
│   │   ├── [locale]/           # 本地化页面路由
│   │   │   ├── page.tsx        # 入口页（玻璃拟态动效）
│   │   │   ├── layout.tsx      # 根布局
│   │   │   ├── admin/          # 管理后台
│   │   │   ├── search/         # 研究者搜索
│   │   │   ├── circles/        # 学术圈
│   │   │   └── field/[slug]/   # 领域详情
│   │   └── api/                # API 路由
│   │       ├── auth/           # 认证（注册、NextAuth）
│   │       ├── persons/[id]/rating/  # 评分查询
│   │       ├── reports/        # 举报管理
│   │       ├── fields/         # 领域管理
│   │       ├── circles/        # 圈子数据
│   │       ├── search/         # 搜索
│   │       ├── feed/           # 论文动态
│   │       ├── upload/         # 文件上传
│   │       └── dashboard/      # 仪表盘
│   ├── components/
│   │   ├── ui/                 # 通用 UI 组件（Button、Card、Input、Dialog 等）
│   │   ├── effects/            # 视觉效果（粒子、玻璃光效、滚动揭示）
│   │   ├── entrance/           # 入口页组件
│   │   ├── home/               # 首页组件（统计、热门领域）
│   │   ├── search/             # 搜索组件
│   │   ├── circles/            # 圈子卡片
│   │   ├── field/              # 领域树
│   │   ├── layout/             # 布局组件（页脚、条件布局）
│   │   └── seo/                # SEO 结构化数据
│   ├── hooks/                  # 自定义 Hooks（数字滚动等）
│   └── lib/
│       ├── auth.ts             # NextAuth 配置
│       ├── prisma.ts           # Prisma 客户端
│       ├── api/                # API 工具（校验、错误、分页）
│       ├── rating/             # 评分计算、衰减、权重
│       ├── feed/               # arXiv API 集成与动态富化
│       ├── i18n/               # 国际化配置与路由
│       ├── security/           # 安全头配置
│       └── scraping/           # 数据抓取调度
├── scripts/                    # 脚本（去重、导入、抓取）
└── tests/                      # 测试文件
```

## 🚀 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 数据库
- npm / yarn / pnpm / bun

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd transparent-domain

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入数据库连接等配置
```

### 环境变量

```env
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/transparent_domain"

# NextAuth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# SMTP（邮箱验证）
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="user@example.com"
SMTP_PASS="password"
SMTP_FROM="noreply@transparent-domain.org"
```

### 数据库初始化

```bash
# 运行数据库迁移
npm run db:migrate

# 生成 Prisma 客户端
npm run db:generate

# 导入种子数据（可选）
npm run db:seed
```

### 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看效果。

### 运行测试

```bash
# 单元测试
npx vitest run

# E2E 测试
npx playwright test
```

## 📦 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run db:generate` | 生成 Prisma 客户端 |
| `npm run db:migrate` | 运行数据库迁移 |
| `npm run db:seed` | 导入种子数据 |
| `npm run db:setup` | 迁移 + 种子数据（一步完成） |


## 🔐 评分系统详解

### 评分维度
每个研究者的综合评分由多个维度加权计算：

- 研究质量（RESEARCH_QUALITY）
- 学术诚信（ACADEMIC_INTEGRITY）
- 产出效率（PRODUCTIVITY）
- 合作贡献（COLLABORATION）
- 教学贡献（TEACHING）
- 社会影响力（SOCIAL_IMPACT）

### 评分变化来源
- **用户举报审核通过** → 对应维度扣分
- **管理员手动调整** → 直接修改评分
- **系统自动计算** → 基于论文产出、引用等指标的自动化评分

### 时间衰减
评分的有效期随时间递减，确保评分反映的是研究者近期的学术表现：

| 时间范围 | 衰减因子 |
|----------|----------|
| 0–6 个月 | 1.00 |
| 6–12 个月 | 0.85 |
| 12–24 个月 | 0.70 |
| 24–36 个月 | 0.50 |
| 36 个月以上 | 0.30 |

## 📄 License

Private — All rights reserved.
