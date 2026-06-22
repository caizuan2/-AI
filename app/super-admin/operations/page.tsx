import { LineChart } from "lucide-react";
import { ModulePlaceholder } from "@/components/super-admin/common/ModulePlaceholder";

export default function SuperAdminOperationsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Operations Center"
      title="运营管理中心"
      description="面向超级管理员的公告、反馈、客户成功动作和运营数据入口。当前仅拆分模块页，不影响现有用户端或投喂端功能。"
      icon={LineChart}
      status="运营入口"
      capabilities={[
        "公告、反馈和运营动作管理预留",
        "客户成功和异常请求跟进视图预留",
        "跨 Web / APK / EXE 运营策略入口",
        "后续联动审计日志与系统通知"
      ]}
      boundaries={[
        "不修改用户端页面和聊天业务逻辑。",
        "不修改管理员投喂版内容投喂流程。",
        "不新增外部营销或支付 SDK。"
      ]}
      nextHref="/super-admin/audit"
      nextLabel="查看审计日志"
    />
  );
}
