import {
  BarChart3,
  Bot,
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
  { label: "AI CRM", icon: UsersRound },
  { label: "培训中心", icon: GraduationCap },
  { label: "数据中心", icon: BarChart3 },
  { label: "设置", icon: Settings }
] as const;
