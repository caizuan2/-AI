import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/super-admin/common/ModulePlaceholder";

export default function SuperAdminSettingsPage() {
  return (
    <ModulePlaceholder
      eyebrow="System Settings"
      title="系统设置中心"
      description="统一展示超级管理员级全局参数、功能开关、运行环境和安全策略入口。会话菜单开关已拆到历史会话控制模块。"
      icon={Settings}
      status="配置入口"
      capabilities={[
        "全局运行参数与环境标识入口",
        "功能开关中心导航与审计策略",
        "系统告警阈值和安全策略预留",
        "后续接入配置版本和回滚审计"
      ]}
      boundaries={[
        "不修改阿里云部署配置。",
        "不修改登录、注册、卡密激活核心逻辑。",
        "本阶段不写入生产环境变量。"
      ]}
      nextHref="/super-admin/conversation-controls"
      nextLabel="打开功能开关"
    />
  );
}
