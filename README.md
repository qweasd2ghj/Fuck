# 异想剧场 0.6.0（功能预览版）

这是从原仓库 v0.5.0 的设置键与数据结构迁移的更新包。原有 `side_story_theater` 扩展设置中的剧场、剧本、收藏记录、正则副本和预设副本会继续保留；安装前仍建议备份酒馆数据。

## 包含内容

- 独立手机优先剧场窗口、可拖动浮动入口、扩展菜单入口；多剧场切换、创建和删除。
- Quiet / Raw 主 API 调用使用 SillyTavern `getContext()` 提供的生成方法；副 API 使用 OpenAI 兼容 Chat Completions。
- 角色卡、Persona、可读取的世界书数据与主线聊天只读快照；番外单独保存，不向主聊天数组追加消息。
- 剧本库、番外收藏馆、JSON 备份与恢复。
- 原生预设读取入口：通过当前 API 对应的 PresetManager 只读枚举预设；只允许创建剧场副本后编辑。提供表格编辑、筛选、全选/全不选和批量启停，不调用酒馆原生预设的保存、更新、删除接口。
- 副 API `/models` 拉取与手动模型 ID；按 Provider/API + Model ID 保存参数档案。只有手动标记为受支持的参数才会写入副 API 请求。
- 独立输出正则；扫描酒馆全局与当前角色卡可读取的正则数据并复制，不回写原始规则。
- TavernHelper 兼容性检查页：只读取页面中可见的脚本名称/元数据线索，报告待验证状态；不会执行、复制、修改或启停第三方脚本。

## 重要限制（请先看）

1. 酒馆当前公开的 `generateQuietPrompt()` / `generateRaw()` 接口没有在官方扩展文档中声明逐请求覆盖任意采样参数的通用参数对象。因此模型参数中心会记忆档案；当前版本只在副 API 请求中发送你明确勾选为支持的参数。主 API 参数档案不会擅自改写酒馆全局预设。
2. Context Length 仅按模型记忆，不会被盲目发给 API。Temperature、Top P、Repetition Penalty、Reasoning Effort、Thinking Budget 也必须由你确认模型/代理支持后才勾选。
3. 原生预设扫描依赖当前活动 API 暴露的 PresetManager。不同 API 的预设格式不同；只有能识别 `prompts` / `entries` 结构的预设才可建立条目副本。扫描无结果时可手动导入 JSON。
4. TavernHelper 脚本管理器没有可依赖的统一公开枚举接口。本版兼容页只做可见名称检测和风险备注，不会把“检测到名称”冒充“已验证兼容”。
5. 副 API Key 仅保留在当前浏览器页面会话的内存中，不写进扩展设置、导出文件或本 ZIP；刷新页面后需要重新输入。浏览器同源请求还可能受 API 服务端 CORS 策略限制。
6. 尚未在你的 Termux / SillyTavern 实例中进行真实模型连接测试。安装后请先检查扩展是否加载，再检查原生预设扫描与主/副 API 连接。

## 安装

将 ZIP 解压后，把 `异想剧场` 文件夹放入 SillyTavern 的第三方扩展目录（通常为 `public/scripts/extensions/third-party/`），确保文件夹内直接包含 `manifest.json`、`index.js`、`style.css`，然后刷新页面。

如果你通过酒馆的“Install from URL”安装 Git 仓库，则继续使用仓库方式；ZIP 是本地手动部署包。
