---
name: mami-phased-development
description: Run any software project from materials audit through phased implementation, user acceptance, documentation synchronization, Git release, and later-version continuity. Use when a user provides project files, asks to plan and build a platform incrementally, reports a project bug, requests a new iteration, or needs a reusable development workflow.
---

# MaMi 阶段化开发

## Overview

按“材料整理 → 共同定稿 → 阶段开发 → 验收发布 → 版本迭代”的闭环推进任何项目。以仓库现状和用户最新确认的规则为准；不得一次性实现整个平台或同阶段多个未确认事项。

## 全局项目流程规范

### 第一阶段：材料整理与项目定稿

#### 1. 资料盘点与风险核查

先读取用户提供的资料、代码和文档，确认开发场景、技术栈、现有实现与资料边界。完成以下三项输出，禁止直接开始业务开发：

1. 检查项目核心关键信息是否齐全，列出缺漏内容。
2. 排查业务流程、功能规则的逻辑漏洞和矛盾点。
3. 结合实际开发场景，分析技术实现难点、依赖、落地风险与需要人工操作的事项。

对每项结论提供证据位置或明确假设。不可因资料不完整而擅自补全会改变产品方向的决定。

#### 2. 与用户共同完善文档

用户逐项回复后，先评估要求：

- 合理且在当前范围内：按确认内容修正文档、数据结构、流程或规则。
- 与已有规则冲突：指出冲突、影响和可选方案，等待用户确认；不得静默取舍。
- 被降级或延后：写入对应阶段/待办，不提前实现。

重复这一过程，直至需求、规则、数据关系和人工依赖可执行。以最新用户确认覆盖旧文档，消除会误导开发的旧描述。

#### 3. 构建或更新 README

资料定稿后，建立根目录 `README.md`，至少包含：

- 项目简介：项目是什么、解决什么问题、核心功能、适用场景；
- 精简树形目录：只标注关键文件/目录和作用，不列缓存、构建产物；
- 环境依赖与运行要求；
- 快速启动、部署和特殊配置/必填参数；
- 开发说明、注意事项、数据与密钥安全边界；
- 当前阶段、已完成能力和验收文档链接。

### 第二阶段：正式开发

#### 1. 先做全平台阶段规划

基于定稿资料，把平台拆为 3–5 个独立、可验证的阶段，并同步 README。每个阶段必须写清：

- 阶段目标；
- 功能清单；
- 人工依赖：用户需要部署、配置、授权、导入或真机操作什么；
- 小白可执行的验收标准：看哪个页面、运行什么命令、检查哪条数据、预期结果是什么。

向用户询问规划是否合理。未收到明确“确认”前，不写业务代码。

#### 2. 每个阶段的前置约束

收到确认后，才开始当前阶段，并执行：

1. 新建独立 Git 分支；仅实现当前指定阶段，禁止提前实现下一阶段。
2. 遵循统一目录、命名、注释、异常处理和基础单元/静态测试规范。
3. 增量开发：先基础骨架，再业务逻辑，最后交互、联调和视觉优化。
4. 每完成一个子功能点，提供自测步骤并停下等待验收；不连续推进未确认子项。
5. 若用户提出超出当前阶段的新功能，主动指出阶段边界和影响，等待二次确认后再调整范围。
6. 创建并动态维护 `docs/阶段N验收.md`。固定表头：`编号 | 功能点 | 验收情况`；状态固定为 `通过✅ / 待验收⌛️ / 待开始⏸`。每次用户验收后同步更新。
7. 同一错误多轮仍未解决时，在 `docs/问题与解决方案.md` 记录现象、根因、解决方案、验证方式和避免复发的经验。

#### 3. 阶段完成与交接

全部验收通过后，在用户授权下：

1. 运行与风险匹配的测试、静态检查和发布前检查；区分本地通过、云端部署通过、真机通过。
2. 更新阶段验收结论、`docs/开发计划.md` 与根目录 README 的阶段进展。
3. 提交当前分支并合并到主分支；仅在用户授权或明确要求时推送远端。
4. 向用户说明下一阶段目标、功能清单、人工依赖和验收标准；等待确认后创建下一阶段验收文档与新分支。

### 第三阶段：版本迭代与跨对话连续性

每次收到新需求前，先快速回忆和核对：README、开发计划、最近阶段验收、问题与解决方案、当前 Git 分支/提交、相关架构和数据结构。然后：

- 一组彼此关联的新需求视为一个新阶段；零星修复归入当前阶段并编号。
- 不自行定义版本号；版本号由用户确认或项目既有发布规则决定。
- 新阶段仍沿用材料核查、范围确认、单项验收、文档同步和 Git 收尾流程。
- 不因换了对话就假设项目从零开始；先用仓库文档和代码恢复上下文，再提出最小必要问题。

## 持续反馈与文档原则

- 工具操作前，在 commentary 简短说明正在检查或实现什么。
- 每次验收同步使用 Markdown 表格，且最终答复无需依赖被折叠的中间消息。
- 只有用户明确确认后，才能将验收项标记为通过。
- 云函数、数据库、外部服务等变更必须写明人工部署/配置步骤；不得把本地编辑说成已上线。
- 密钥、Token、用户隐私数据不得写入前端、README、示例、日志或 Git。
- 文档是项目记忆：业务规则变更、问题复盘、阶段结论和部署限制必须落到对应文档，而不是只留在对话中。

## MaMi 项目特定补充（仅在 MaMi 仓库使用时适用）

1. 在改代码前读取相关页面、云函数、`README.md`、`docs/开发计划.md`、最新阶段验收和 `docs/问题与解决方案.md`。
2. 先输出阶段规划：目标、功能清单、人工依赖、面向非技术用户的验收标准。等待用户明确“确认”后再创建 `codex/phaseN-<topic>` 分支并实现。
3. 新建 `docs/阶段N验收.md`，固定表头为 `验收编号 | 待验收项目 | 实际验收情况`；同步开发计划和 README 的阶段状态。
4. 每轮只处理一个验收编号。先在 commentary 说明编号和范围，再读取真实数据流、实施、运行 `node --check`、`git diff --check`；云函数还应运行 `scripts/verify-phase4.ps1` 或替代脚本。
5. 清楚区分静态验证与人工验证。云函数改动必须列出需重新部署的函数；本地改动不会自动上线。
6. 每次验收同步都使用 Markdown 表格，状态只用“待验收 / 通过 / 待修改”。只有用户明确说“通过”才更新文档为通过。
7. 用户反馈 UI 或业务问题时做最小局部修复。返回页面状态丢失时，优先检查 `onShow`、重新加载和 `setData` 覆盖。
8. 同一问题超过两轮仍未解决时，写入 `docs/问题与解决方案.md`：现象、根因、解决方案、验证方式。
9. AI 密钥只放云函数环境变量，绝不写入前端、仓库文档、示例或提交。跨系统图标避免 Emoji，优先 SVG 或 WXML/WXSS 图形。
10. 阶段通过后更新验收结论、版本号、README 与开发计划；静态检查通过后，在用户明确授权下提交、合并 `master` 并按意图推送。

## MaMi 规则基线

- 学习状态、打卡、统计和经验库按 `user + plan + problem` 或 `user + plan` 隔离；每用户仅一个 active 计划，新计划覆盖旧计划。
- 新刷按题库顺序；复刷按漏刷优先、今日到期其次。新刷为第 0 天，理想复习节点为第 1、3、7、15、31 天。
- 复刷上限仅统计到期复刷；达到上限后停止排程，但保留等级和全部提交记录。
- 允许重复提交；同题同自然日最多升级一级；任何成功提交即打卡。

## 维护备注

以下初始化模板文字不属于 MaMi 工作流；执行本技能时忽略。

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)
- Works well when there are clear step-by-step procedures
- Example: DOCX skill with "Workflow Decision Tree" -> "Reading" -> "Creating" -> "Editing"
- Structure: ## Overview -> ## Workflow Decision Tree -> ## Step 1 -> ## Step 2...

**2. Task-Based** (best for tool collections)
- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" -> "Merge PDFs" -> "Split PDFs" -> "Extract Text"
- Structure: ## Overview -> ## Quick Start -> ## Task Category 1 -> ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)
- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" -> "Colors" -> "Typography" -> "Features"
- Structure: ## Overview -> ## Guidelines -> ## Specifications -> ## Usage...

**4. Capabilities-Based** (best for integrated systems)
- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" -> numbered capability list
- Structure: ## Overview -> ## Core Capabilities -> ### 1. Feature -> ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:
- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources (optional)

Create only the resource directories this skill actually needs. Delete this section if no resources are required.

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: `fill_fillable_fields.py`, `extract_form_field_info.py` - utilities for PDF manipulation
- DOCX skill: `document.py`, `utilities.py` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Codex for patching or environment adjustments.

### references/
Documentation and reference material intended to be loaded into context to inform Codex's process and thinking.

**Examples from other skills:**
- Product management: `communication.md`, `context_building.md` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Codex should reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output Codex produces.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Not every skill requires all three types of resources.**
