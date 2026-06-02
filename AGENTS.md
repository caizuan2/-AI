# AI 知识库 APP 项目说明

## 产品目标
开发一个“对话式投喂型 AI 知识库 APP”。
第一版只做闭环：聊天投喂 + AI 自动整理 + 知识入库 + 知识问答 + 引用来源。

## 技术栈
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- PostgreSQL
- pgvector
- OpenAI API

## 代码规范
- 所有代码使用 TypeScript
- API 返回统一 JSON
- UI 先做简洁可用，不追求复杂动画
- 所有核心功能都要有 loading、empty、error 状态
- 不要一次性做高级功能，比如团队协作、知识图谱、语音、微信导入

## MVP 功能
1. 用户可以在聊天框中投喂知识
2. AI 自动生成标题、摘要、标签、分类、重要程度
3. 用户可以确认入库
4. 知识库列表可以查看、搜索、筛选
5. 用户可以基于知识库提问
6. 回答必须带引用来源
