import {
  BarChart3,
  Bot,
  BookOpenCheck,
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
  { label: "设置", icon: Settings }
] as const;
