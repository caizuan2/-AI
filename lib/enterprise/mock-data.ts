import type {
  AuditLog,
  DashboardStats,
  DownloadPackage,
  QuickAction,
  SuperAdminMenuItem,
  SystemHealth
} from "@/types/super-admin";
import type {
  DeviceRisk,
  DeviceSession,
  PlatformDownload,
  PlatformSyncStatus,
  PlatformVersion,
  SyncEvent,
  SyncMatrixRow
} from "@/types/super-admin-sync";

export const superAdminMenus: SuperAdminMenuItem[] = [
  {
    title: "数据看板",
    href: "/super-admin",
    description: "企业级核心指标总览",
    icon: "LayoutDashboard"
  },
  {
    title: "企业管理",
    href: "/super-admin/organizations",
    description: "企业组织、部门与租户",
    icon: "Building2",
    badge: "规划中"
  },
  {
    title: "用户与权限",
    href: "/super-admin/users",
    description: "账号、角色、授权与状态",
    icon: "Users"
  },
  {
    title: "角色权限",
    href: "/super-admin/roles",
    description: "角色矩阵与三端边界",
    icon: "ShieldCheck"
  },
  {
    title: "历史会话控制",
    href: "/super-admin/conversation-controls",
    description: "用户端会话菜单开关与审计",
    icon: "ShieldCheck",
    badge: "New"
  },
  {
    title: "知识库管理",
    href: "/super-admin/knowledge",
    description: "文档、分类、审核与索引",
    icon: "Database"
  },
  {
    title: "卡密授权",
    href: "/super-admin/licenses",
    description: "用户端、投喂端统一授权",
    icon: "KeyRound"
  },
  {
    title: "Team OS 授权",
    href: "/super-admin/licenses/team-os",
    description: "企业卡密、激活、禁用与续期",
    icon: "KeyRound",
    badge: "New"
  },
  {
    title: "商业化概览",
    href: "/super-admin/commercial",
    description: "套餐、收入风险与卡密运营",
    icon: "LineChart",
    badge: "New"
  },
  {
    title: "订阅与套餐",
    href: "/super-admin/subscriptions",
    description: "企业订阅、状态与到期",
    icon: "KeyRound"
  },
  {
    title: "Quota 限额",
    href: "/super-admin/quotas",
    description: "套餐策略与用量控制",
    icon: "Settings"
  },
  {
    title: "使用量统计",
    href: "/super-admin/usage",
    description: "租户、用户与系统级用量",
    icon: "LineChart"
  },
  {
    title: "三端同步",
    href: "/super-admin/sync",
    description: "Web、APK、EXE 同步状态",
    icon: "MonitorDown",
    badge: "Mock"
  },
  {
    title: "设备会话",
    href: "/super-admin/devices",
    description: "三端登录设备与风险",
    icon: "Smartphone"
  },
  {
    title: "平台版本",
    href: "/super-admin/platforms",
    description: "超级管理员端发布状态",
    icon: "Download"
  },
  {
    title: "环境连通性",
    href: "/super-admin/env-check",
    description: "数据库、数据源与自测检查",
    icon: "ServerCog",
    badge: "检查"
  },
  {
    title: "系统健康状态",
    href: "/super-admin/system-health",
    description: "三端数据源和持久化状态",
    icon: "ServerCog"
  },
  {
    title: "AI 模型配置",
    href: "/super-admin/model-config",
    description: "模型、额度、成本与策略",
    icon: "Bot"
  },
  {
    title: "下载与更新",
    href: "/super-admin/downloads",
    description: "Web、APK、EXE 发布中心",
    icon: "Download",
    badge: "Mock"
  },
  {
    title: "安全审计日志",
    href: "/super-admin/audit",
    description: "登录、异常、权限操作",
    icon: "ShieldCheck"
  },
  {
    title: "运营管理",
    href: "/super-admin/operations",
    description: "公告、反馈与运营动作",
    icon: "LineChart"
  },
  {
    title: "系统设置",
    href: "/super-admin/settings",
    description: "全局参数和运行配置",
    icon: "Settings"
  }
];

export const superAdminStats: DashboardStats[] = [
  {
    title: "今日提问次数",
    value: "1,286",
    unit: "次",
    status: "normal",
    trend: "较昨日 +12.4%",
    description: "覆盖 Web、APK、EXE 的知识库问答请求。",
    icon: "MessageSquareText",
    tone: "sky"
  },
  {
    title: "知识库文档数量",
    value: "24,860",
    unit: "篇",
    status: "normal",
    trend: "本周新增 438 篇",
    description: "包含已入库且未删除的企业知识文档。",
    icon: "Files",
    tone: "emerald"
  },
  {
    title: "用户总数",
    value: "3,482",
    unit: "人",
    status: "normal",
    trend: "本月新增 216 人",
    description: "全部企业账号、管理员与终端用户。",
    icon: "Users",
    tone: "slate"
  },
  {
    title: "活跃用户数",
    value: "914",
    unit: "人",
    status: "normal",
    trend: "近 24 小时活跃",
    description: "有登录、提问、上传或投喂行为的账号。",
    icon: "Activity",
    tone: "emerald"
  },
  {
    title: "卡密激活数量",
    value: "2,974",
    unit: "个",
    status: "normal",
    trend: "激活率 85.4%",
    description: "已激活的授权码与企业席位。",
    icon: "KeyRound",
    tone: "emerald"
  },
  {
    title: "即将到期账号",
    value: "37",
    unit: "个",
    status: "warning",
    trend: "7 天内需要处理",
    description: "建议在授权中心确认续费或停用策略。",
    icon: "CalendarClock",
    tone: "amber"
  },
  {
    title: "AI 调用次数",
    value: "8,642",
    unit: "次",
    status: "normal",
    trend: "成本预算使用 62%",
    description: "包含问答、摘要、标签和知识整理调用。",
    icon: "Bot",
    tone: "sky"
  },
  {
    title: "异常请求数量",
    value: "18",
    unit: "次",
    status: "warning",
    trend: "近 1 小时 3 次",
    description: "包含鉴权失败、限流、模型超时和上传异常。",
    icon: "TriangleAlert",
    tone: "amber"
  },
  {
    title: "APK 最新版本",
    value: "1.0.10",
    status: "normal",
    trend: "Android 端可用",
    description: "用户端与管理员端安装包版本占位。",
    icon: "Smartphone",
    tone: "slate"
  },
  {
    title: "EXE 最新版本",
    value: "1.0.10",
    status: "normal",
    trend: "Windows 端可用",
    description: "用户端、投喂端和超级管理员端桌面包占位。",
    icon: "MonitorDown",
    tone: "slate"
  },
  {
    title: "系统健康状态",
    value: "稳定",
    status: "normal",
    trend: "核心服务在线",
    description: "API、存储、AI 模型、同步链路均为 mock 状态。",
    icon: "HeartPulse",
    tone: "emerald"
  }
];

export const enterpriseDownloads: Omit<DownloadPackage, "version" | "changelog">[] = [
  {
    id: "user-web",
    group: "用户端",
    appName: "AI 知识库用户端",
    appType: "终端用户",
    platform: "Web",
    currentVersion: "1.0.10",
    latestVersion: "1.0.10",
    downloadUrl: "待配置",
    releaseNotes: "知识问答、历史会话、附件同步稳定版本。",
    forceUpdate: false,
    releasedAt: "2026-06-15 10:00",
    status: "正常"
  },
  {
    id: "user-apk",
    group: "用户端",
    appName: "AI 知识库用户端",
    appType: "终端用户",
    platform: "Android APK",
    currentVersion: "1.0.9",
    latestVersion: "1.0.10",
    downloadUrl: "待配置",
    releaseNotes: "修复附件上传 MIME 兼容性，保留强制更新策略占位。",
    forceUpdate: true,
    releasedAt: "2026-06-15 10:00",
    status: "需更新"
  },
  {
    id: "user-exe",
    group: "用户端",
    appName: "AI 知识库用户端",
    appType: "终端用户",
    platform: "Windows EXE",
    currentVersion: "1.0.10",
    latestVersion: "1.0.10",
    downloadUrl: "待配置",
    releaseNotes: "桌面端登录、上传、聊天窗口稳定版本。",
    forceUpdate: false,
    releasedAt: "2026-06-15 10:00",
    status: "正常"
  },
  {
    id: "admin-web",
    group: "投喂管理员端",
    appName: "知识投喂管理员端",
    appType: "知识运营",
    platform: "Web",
    currentVersion: "1.0.10",
    latestVersion: "1.0.10",
    downloadUrl: "待配置",
    releaseNotes: "投喂、审核、知识整理流程保持现状。",
    forceUpdate: false,
    releasedAt: "2026-06-15 11:30",
    status: "正常"
  },
  {
    id: "admin-apk",
    group: "投喂管理员端",
    appName: "知识投喂管理员端",
    appType: "知识运营",
    platform: "Android APK",
    currentVersion: "1.0.8",
    latestVersion: "1.0.10",
    downloadUrl: "待配置",
    releaseNotes: "移动投喂端上传与历史能力占位展示。",
    forceUpdate: false,
    releasedAt: "2026-06-15 11:30",
    status: "测试中"
  },
  {
    id: "admin-exe",
    group: "投喂管理员端",
    appName: "知识投喂管理员端",
    appType: "知识运营",
    platform: "Windows EXE",
    currentVersion: "1.0.10",
    latestVersion: "1.0.10",
    downloadUrl: "待配置",
    releaseNotes: "Windows 投喂控制台稳定版本占位。",
    forceUpdate: false,
    releasedAt: "2026-06-15 11:30",
    status: "正常"
  },
  {
    id: "super-admin-web",
    group: "超级管理员端",
    appName: "企业超级管理员端",
    appType: "最高控制台",
    platform: "Web",
    currentVersion: "0.1.0",
    latestVersion: "0.1.0",
    downloadUrl: "/super-admin",
    releaseNotes: "第一阶段 UI 骨架，使用静态 mock 数据。",
    forceUpdate: false,
    releasedAt: "2026-06-17 09:00",
    status: "测试中"
  },
  {
    id: "super-admin-apk",
    group: "超级管理员端",
    appName: "企业超级管理员端",
    appType: "最高控制台",
    platform: "Android APK",
    currentVersion: "待发布",
    latestVersion: "0.1.0",
    downloadUrl: "待配置",
    releaseNotes: "仅展示发布占位，不触发打包。",
    forceUpdate: false,
    releasedAt: "待发布",
    status: "待发布"
  },
  {
    id: "super-admin-exe",
    group: "超级管理员端",
    appName: "企业超级管理员端",
    appType: "最高控制台",
    platform: "Windows EXE",
    currentVersion: "待发布",
    latestVersion: "0.1.0",
    downloadUrl: "待配置",
    releaseNotes: "仅展示发布占位，不触发打包。",
    forceUpdate: false,
    releasedAt: "待发布",
    status: "待发布"
  }
];

export const auditLogPreview: Omit<AuditLog, "user" | "action" | "ip">[] = [
  {
    id: "audit-001",
    category: "登录",
    title: "超级管理员登录成功",
    actor: "super-admin@example.com",
    time: "2026-06-17 08:48",
    status: "normal",
    description: "来自企业内网 Web 控制台的模拟登录记录。"
  },
  {
    id: "audit-002",
    category: "知识库",
    title: "知识库批量整理任务完成",
    actor: "知识运营管理员",
    time: "2026-06-17 08:20",
    status: "normal",
    description: "生成摘要、标签和分类共 128 条。"
  },
  {
    id: "audit-003",
    category: "异常",
    title: "模型调用出现短暂超时",
    actor: "AI 网关",
    time: "2026-06-17 07:56",
    status: "warning",
    description: "自动重试后恢复，未影响用户最终回答。"
  },
  {
    id: "audit-004",
    category: "版本",
    title: "用户端 APK 版本进入强制更新策略",
    actor: "发布控制台",
    time: "2026-06-16 22:10",
    status: "warning",
    description: "用于兼容附件上传修复后的版本推进。"
  }
];

export const systemHealthItems: Omit<SystemHealth, "health">[] = [
  {
    name: "核心 API",
    status: "normal",
    availability: "99.98%",
    latency: "86ms",
    description: "问答、知识库、登录相关接口状态占位。",
    checkedAt: "2026-06-17 09:10"
  },
  {
    name: "对象存储",
    status: "normal",
    availability: "99.95%",
    latency: "112ms",
    description: "图片、文件、拍照附件同步链路占位。",
    checkedAt: "2026-06-17 09:10"
  },
  {
    name: "AI 模型网关",
    status: "warning",
    availability: "99.40%",
    latency: "620ms",
    description: "模型调用峰值期间存在轻微排队。",
    checkedAt: "2026-06-17 09:10"
  },
  {
    name: "版本更新服务",
    status: "normal",
    availability: "100%",
    latency: "54ms",
    description: "Web、APK、EXE 更新清单展示占位。",
    checkedAt: "2026-06-17 09:10"
  },
  {
    name: "同步通道",
    status: "normal",
    availability: "99.91%",
    latency: "140ms",
    description: "文字、图片、文件同步状态占位。",
    checkedAt: "2026-06-17 09:10"
  }
];

export const quickActions: QuickAction[] = [
  {
    title: "新增企业",
    description: "创建企业组织、部门与初始管理员。",
    href: "/super-admin/organizations",
    icon: "Building2",
    status: "pending"
  },
  {
    title: "查看用户",
    description: "进入用户与权限中心查看账号状态。",
    href: "/super-admin/users",
    icon: "Users",
    status: "normal"
  },
  {
    title: "生成卡密",
    description: "打开授权管理入口，准备席位与到期策略。",
    href: "/super-admin/licenses",
    icon: "KeyRound",
    status: "normal"
  },
  {
    title: "配置模型",
    description: "检查模型供应商、额度和成本策略。",
    href: "/super-admin/model-config",
    icon: "Bot",
    status: "warning"
  },
  {
    title: "发布版本",
    description: "查看 APK、EXE、Web 的发布占位状态。",
    href: "/super-admin/downloads",
    icon: "UploadCloud",
    status: "normal"
  },
  {
    title: "查看日志",
    description: "预览安全审计和异常请求记录。",
    href: "/super-admin/audit",
    icon: "ShieldCheck",
    status: "normal"
  }
];

export const superAdminPlatformSyncStatuses: PlatformSyncStatus[] = [
  {
    platform: "web",
    appType: "super_admin",
    version: "1.8.0-web",
    onlineStatus: "online",
    lastSyncAt: "2026-06-17 18:05:24",
    syncHealth: "healthy",
    pendingSyncCount: 0,
    failedSyncCount: 0,
    latencyMs: 86,
    conflictCount: 0,
    dataScopes: [
      "account_status",
      "admin_actions",
      "chat_history",
      "system_config",
      "license_status",
      "tenant_rbac",
      "commercial_usage",
      "download_versions",
      "attachments",
      "audit_logs"
    ],
    downloadUrl: "/super-admin",
    forceUpdate: false,
    updateStatus: "latest"
  },
  {
    platform: "android_apk",
    appType: "super_admin",
    version: "1.8.0-apk",
    onlineStatus: "degraded",
    lastSyncAt: "2026-06-17 18:03:10",
    syncHealth: "warning",
    pendingSyncCount: 7,
    failedSyncCount: 1,
    latencyMs: 214,
    conflictCount: 1,
    dataScopes: [
      "account_status",
      "admin_actions",
      "chat_history",
      "license_status",
      "tenant_rbac",
      "commercial_usage",
      "attachments",
      "audit_logs"
    ],
    downloadUrl: "/downloads/super-admin/android/latest.apk",
    forceUpdate: false,
    updateStatus: "available"
  },
  {
    platform: "windows_exe",
    appType: "super_admin",
    version: "1.8.0-exe",
    onlineStatus: "online",
    lastSyncAt: "2026-06-17 18:04:48",
    syncHealth: "healthy",
    pendingSyncCount: 2,
    failedSyncCount: 0,
    latencyMs: 132,
    conflictCount: 0,
    dataScopes: [
      "account_status",
      "admin_actions",
      "chat_history",
      "system_config",
      "license_status",
      "tenant_rbac",
      "commercial_usage",
      "download_versions",
      "attachments",
      "audit_logs"
    ],
    downloadUrl: "/downloads/super-admin/windows/latest.exe",
    forceUpdate: false,
    updateStatus: "latest"
  }
];

export const superAdminSyncMatrixRows: SyncMatrixRow[] = [
  {
    scope: "chat_history",
    label: "聊天记录",
    web: "synced",
    android_apk: "pending",
    windows_exe: "synced"
  },
  {
    scope: "admin_actions",
    label: "操作日志",
    web: "synced",
    android_apk: "synced",
    windows_exe: "synced"
  },
  {
    scope: "license_status",
    label: "卡密状态",
    web: "synced",
    android_apk: "synced",
    windows_exe: "synced"
  },
  {
    scope: "tenant_rbac",
    label: "企业数据",
    web: "synced",
    android_apk: "synced",
    windows_exe: "synced"
  },
  {
    scope: "tenant_rbac",
    label: "用户权限",
    web: "synced",
    android_apk: "pending",
    windows_exe: "synced"
  },
  {
    scope: "commercial_usage",
    label: "商业化数据",
    web: "synced",
    android_apk: "synced",
    windows_exe: "synced"
  },
  {
    scope: "attachments",
    label: "文件 / 图片 / 拍照附件",
    web: "synced",
    android_apk: "error",
    windows_exe: "synced"
  },
  {
    scope: "download_versions",
    label: "下载版本",
    web: "synced",
    android_apk: "pending",
    windows_exe: "synced"
  }
];

export const superAdminSyncEvents: SyncEvent[] = [
  {
    id: "sync-event-001",
    time: "2026-06-17 18:05:24",
    platform: "web",
    account: "root@enterprise.local",
    action: "更新系统配置",
    scope: "system_config",
    result: "synced",
    durationMs: 82
  },
  {
    id: "sync-event-002",
    time: "2026-06-17 18:04:48",
    platform: "windows_exe",
    account: "ops@enterprise.local",
    action: "查看卡密授权",
    scope: "license_status",
    result: "synced",
    durationMs: 126
  },
  {
    id: "sync-event-003",
    time: "2026-06-17 18:03:10",
    platform: "android_apk",
    account: "support@enterprise.local",
    action: "上传拍照附件",
    scope: "attachments",
    result: "error",
    durationMs: 1240
  },
  {
    id: "sync-event-004",
    time: "2026-06-17 18:01:36",
    platform: "android_apk",
    account: "support@enterprise.local",
    action: "同步聊天记录",
    scope: "chat_history",
    result: "pending",
    durationMs: 410
  }
];

export const superAdminDeviceSessions: DeviceSession[] = [
  {
    deviceId: "web-session-001",
    account: "root@enterprise.local",
    platform: "web",
    appVersion: "1.8.0-web",
    deviceName: "Chrome / Windows",
    ip: "10.16.8.21",
    location: "Shanghai CN",
    loginAt: "2026-06-17 09:12:10",
    lastActiveAt: "2026-06-17 18:05:24",
    sessionStatus: "active",
    riskLevel: "low",
    syncStatus: "synced"
  },
  {
    deviceId: "apk-session-014",
    account: "support@enterprise.local",
    platform: "android_apk",
    appVersion: "1.8.0-apk",
    deviceName: "Pixel 8 Pro",
    ip: "10.16.10.44",
    location: "Hangzhou CN",
    loginAt: "2026-06-17 11:44:02",
    lastActiveAt: "2026-06-17 18:03:10",
    sessionStatus: "active",
    riskLevel: "medium",
    syncStatus: "error"
  },
  {
    deviceId: "exe-session-009",
    account: "ops@enterprise.local",
    platform: "windows_exe",
    appVersion: "1.8.0-exe",
    deviceName: "ThinkPad X1",
    ip: "10.16.8.29",
    location: "Shanghai CN",
    loginAt: "2026-06-17 08:50:36",
    lastActiveAt: "2026-06-17 18:04:48",
    sessionStatus: "active",
    riskLevel: "low",
    syncStatus: "synced"
  },
  {
    deviceId: "web-session-legacy",
    account: "audit@enterprise.local",
    platform: "web",
    appVersion: "1.7.4-web",
    deviceName: "Edge / Windows",
    ip: "203.0.113.18",
    location: "Unknown",
    loginAt: "2026-06-16 22:18:00",
    lastActiveAt: "2026-06-17 12:32:18",
    sessionStatus: "idle",
    riskLevel: "high",
    syncStatus: "pending"
  }
];

export const superAdminDeviceRisks: DeviceRisk[] = [
  {
    id: "risk-001",
    deviceId: "apk-session-014",
    account: "support@enterprise.local",
    riskLevel: "medium",
    reason: "拍照附件同步失败 1 次，等待重试队列处理。",
    detectedAt: "2026-06-17 18:03:10",
    status: "monitoring"
  },
  {
    id: "risk-002",
    deviceId: "web-session-legacy",
    account: "audit@enterprise.local",
    riskLevel: "high",
    reason: "旧版本 Web 会话来自未知位置，建议后续接入强制下线。",
    detectedAt: "2026-06-17 12:36:22",
    status: "open"
  }
];

export const superAdminPlatformVersions: PlatformVersion[] = [
  {
    appName: "Super Admin Web",
    appType: "super_admin",
    platform: "web",
    currentVersion: "1.8.0-web",
    latestVersion: "1.8.0-web",
    downloadUrl: "/super-admin",
    forceUpdate: false,
    releasedAt: "2026-06-17 09:00:00",
    releaseStatus: "stable",
    syncCapability: "同账号、同后端、同数据源实时读取",
    dataSourceStatus: "shared_backend"
  },
  {
    appName: "Super Admin Android APK",
    appType: "super_admin",
    platform: "android_apk",
    currentVersion: "1.8.0-apk",
    latestVersion: "1.8.1-apk",
    downloadUrl: "/downloads/super-admin/android/latest.apk",
    forceUpdate: false,
    releasedAt: "2026-06-16 20:10:00",
    releaseStatus: "beta",
    syncCapability: "聊天、配置、卡密、附件、审计日志同步预留",
    dataSourceStatus: "shared_backend"
  },
  {
    appName: "Super Admin Windows EXE",
    appType: "super_admin",
    platform: "windows_exe",
    currentVersion: "1.8.0-exe",
    latestVersion: "1.8.0-exe",
    downloadUrl: "/downloads/super-admin/windows/latest.exe",
    forceUpdate: false,
    releasedAt: "2026-06-16 19:30:00",
    releaseStatus: "stable",
    syncCapability: "桌面端管理操作和 Web / APK 保持同源状态",
    dataSourceStatus: "shared_backend"
  }
];

export const superAdminPlatformDownloads: PlatformDownload[] = superAdminPlatformVersions.map((item) => ({
  platform: item.platform,
  appName: item.appName,
  version: item.latestVersion,
  downloadUrl: item.downloadUrl,
  updateStatus: item.currentVersion === item.latestVersion ? "latest" : "available",
  forceUpdate: item.forceUpdate
}));
