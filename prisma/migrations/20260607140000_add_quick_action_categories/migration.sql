CREATE TABLE "quick_action_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "type" TEXT,
  "action" TEXT,
  "prompt" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "quick_action_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quick_action_categories_name_key" ON "quick_action_categories"("name");
CREATE INDEX "quick_action_categories_enabled_idx" ON "quick_action_categories"("enabled");
CREATE INDEX "quick_action_categories_sortOrder_idx" ON "quick_action_categories"("sortOrder");

INSERT INTO "quick_action_categories"
  ("id", "name", "description", "icon", "type", "action", "prompt", "enabled", "sortOrder")
VALUES
  ('quick_default_fast', '快速', '适合日常对话，即时响应。', 'zap', 'mode', 'fill_prompt', NULL, true, 0),
  ('quick_default_creative', 'AI 创作', '快速生成适合继续编辑的内容草稿。', 'sparkles', 'prompt', 'fill_prompt', '请帮我进行 AI 创作：', true, 1),
  ('quick_default_photo_motion', '照片动起来', '照片动起来功能入口。', 'image', 'tool', 'open_upload', '我想了解照片动起来功能：', true, 2),
  ('quick_default_video_call', '视频通话', '视频通话功能入口。', 'video', 'tool', 'fill_prompt', '我想了解视频通话功能：', true, 3)
ON CONFLICT ("name") DO NOTHING;
