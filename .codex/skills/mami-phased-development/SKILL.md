---
name: mami-phased-development
description: Drive MaMi feature work through confirmed phases, one-at-a-time acceptance, Chinese Markdown acceptance tables, implementation and document synchronization, CloudBase deployment guidance, and release handoff. Use for any MaMi iteration, bug fix, phase planning, acceptance update, or branch release in this repository.
---

# MaMi 阶段化开发

## Overview

按“小步实现、人工确认、文档同步”的方式推进 MaMi。以仓库现状和用户最新确认的规则为准；不得一次性实现整个平台或同阶段多个未确认事项。

## 强制工作流

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
