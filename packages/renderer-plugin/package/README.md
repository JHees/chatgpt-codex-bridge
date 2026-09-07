# Codex App Chat Bridge

这是 Bridge 0.1.1 后台协作插件包。已验收 Sol「中」→ Luna 的三轮资料调研闭环；并非所有模型与编码任务的全面验收。

Bridge 将用户选择的 App Chat 规划模型与当前 Codex 执行模型连接起来。后台收发不切换页面，不修改 Codex 模型。支持 `status`、`exchange`、`finish` 三个受控操作；没有前台点击回退、MCP 服务或常驻进程。

## 一次安装

使用 Windows Loader **0.5.11 或更高兼容版本**安装此 ZIP。需要 schema-v2 随包 skill、设置存储与页面导航、输入区控件、可见上下文及原生提交回执。renderer、`bridge-chat` skill 与调用脚本同包更新和回滚，不另装 skill。请先更新 Loader，再检查 Bridge 诊断；本插件不会自行升级 Loader。

权限：`dom`、`local-storage`、`settings`、`composer`、`agent-skills`。不再申请 `trusted-input`。新增权限应由 Loader 安装／更新确认页明确展示。

## 使用

1. 在 Loader 的 Bridge 设置页选择默认模型／模式与思考程度。默认关闭协作，未选择模型；Pro 必须明确选择。
2. 在任务输入区控制面板启用协作，确认可见说明后正常提交。只有原生提交回执确认了任务，Codex 才能调用后台 Chat。
3. 同一协作复用专用 Chat。分段读取不重发；达到等待期限、批次预算或需要用户时暂停，通过任务面板明确继续。
4. Codex 回报真实执行证据并核对交付条件；正常完成默认删除专用 Chat，也可明确保留。用户介入或生成未完成时不自动删除。

运行中的模型、预算与等待参数被冻结；设置变更只用于下次协作。关闭开关不撤回已发送数据，也不停止 Codex 工具。重载后状态重置，不恢复或清扫历史会话。

更新源：[JHees/chatgpt-codex-bridge](https://github.com/JHees/chatgpt-codex-bridge/releases)。自动更新由 Loader 管理且默认关闭。当前候选源码的四种 Spark／Luna 与非 Pro／Pro 实机组合尚未全部验收，不能据此宣称全面支持。
