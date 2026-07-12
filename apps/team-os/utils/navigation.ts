import {
  BarChart3,
  BellRing,
  Bot,
  BookOpenCheck,
  Building2,
  GraduationCap,
  Home,
  ListTodo,
  Network,
  Settings,
  UsersRound
} from "lucide-react";

export const teamOsNavigation = [
  { label: "首页", icon: Home, href: "/team-os" },
  { label: "任务中心", icon: ListTodo, href: "/team-os/tasks" },
  { label: "组织管理", icon: Network, href: "/team-os/organization" },
  { label: "AI 教练", icon: Bot, href: "/team-os/ai-coach" },
  { label: "行业教练", icon: BookOpenCheck, href: "/team-os/industry-coach" },
  { label: "AI CRM", icon: UsersRound, href: "/team-os/crm" },
  { label: "培训中心", icon: GraduationCap, href: "/team-os/training" },
  { label: "数据中心", icon: BarChart3, href: "/team-os/analytics" },
  {
    label: "企业中心",
    icon: Building2,
    href: "/team-os/company",
    activePaths: ["/team-os/company", "/team-os/subscription", "/team-os/usage"]
  },
  {
    label: "消息中心",
    icon: BellRing,
    href: "/team-os/notifications",
    activePaths: ["/team-os/notifications", "/team-os/integrations"]
  },
  { label: "设置", icon: Settings }
] as const;
