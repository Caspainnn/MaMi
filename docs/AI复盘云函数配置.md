# AI 复盘云函数配置

`generateAIAnalysis` 与 `manageExperience` 通过云端调用 AI 服务，密钥不会进入小程序前端、Git 仓库或本地配置文件。

## 部署步骤

1. 在微信开发者工具中选择云环境 `cloud1-d7gwckvr53001d8bc`。
2. 上传并部署 `cloudfunctions/generateAIAnalysis` 与 `cloudfunctions/manageExperience`，均选择“云端安装依赖”。
3. 在两个云函数的环境变量设置中分别新增：

| 变量名 | 是否必填 | 说明 |
| --- | --- | --- |
| `MAMI_AI_API_KEY` | 是 | AI 服务 API Key；仅保存在云端环境变量中。 |
| `MAMI_AI_MODEL` | 否 | 默认使用 `agnes-2.0-flash`。 |
| `MAMI_AI_DRAFT_DAILY_LIMIT` | 否，仅 `generateAIAnalysis` | 单题 AI 总结的每用户每日上限，默认 `10`。 |
| `MAMI_AI_EXPERIENCE_DAILY_LIMIT` | 否，仅 `manageExperience` | “经验++”的每用户每日上限，默认 `1`。 |

4. 重新部署 `cloudfunctions/managePractice`，使提交记录页能够读取 AI 复盘结果。
5. 在云函数测试面板执行一次 `initDB`，为 `ai_analyses` 补充额度查询索引。集合已存在时不会重复创建。

## 调用与额度

- 用户在“总结”输入框右下角主动点击“AI 生成”后，才会调用 AI 云函数；生成的文字会填入输入框，仍可由用户编辑。
- 用户在“经验”页点击“一键追加经验”后，`manageExperience` 会读取当前计划上次追加后的有效总结，自行区分思路与语法，增量追加到两篇可编辑 Markdown 文档；可一键撤销最近一次 AI 追加。
- 只有用户随后保存该提交记录时，生成结果才会与该 `practice_records` 关联为一条 `ai_analyses`，由 `recordId` 唯一索引保证。
- 不点击“AI 生成”不会调用外部 AI 服务，普通提交不受 AI 服务可用性影响。
- “AI 总结”默认限额为每用户每天 10 次、全局每天 200 次。达到限额后不调用外部服务。
- “一键追加经验”单独计数：每位用户每天最多 1 次，不占用也不读取“AI 总结”的个人次数。
- 失败记录可以通过同一 `recordId` 重试，不会新增第二条分析记录。

## 安全要求

- 不要在代码、README、截图、测试参数、云函数日志或 Git 提交中填写 API Key。
- 不要把 API Key 放进 `project.private.config.json` 或任意 `.env` 文件；相关本地 `.env` 已被 `.gitignore` 排除。
- 如密钥已在不受控位置暴露，应立即在服务商后台轮换密钥。
