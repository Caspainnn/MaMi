const cloud = require('wx-server-sdk')
const CloudBase = require('@cloudbase/manager-node')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const DEFAULT_ENV_ID = 'cloud1-d7gwckvr53001d8bc'
const CONFIRM_TOKEN = 'plan_scoped_state_v1'

function getManager() {
  const context = cloud.getWXContext()
  return CloudBase.init({ envId: context.ENV || process.env.TCB_ENV || DEFAULT_ENV_ID })
}

async function getAllStates() {
  const states = []
  let offset = 0
  while (true) {
    const result = await db.collection('user_problems').skip(offset).limit(100).get()
    states.push(...result.data)
    if (result.data.length < 100) return states
    offset += result.data.length
  }
}

async function inspect(manager) {
  const states = await getAllStates()
  const missingPlanIdCount = states.filter((item) => !item.planId).length
  const uniqueResult = await manager.database.checkIndexExists('user_problems', 'user_problem_unique')
  const scopedResult = await manager.database.checkIndexExists('user_problems', 'user_plan_problem_unique')
  return {
    success: true,
    mode: 'inspect',
    totalStates: states.length,
    missingPlanIdCount,
    oldUniqueIndexExists: Boolean(uniqueResult.Exists),
    scopedUniqueIndexExists: Boolean(scopedResult.Exists),
    ready: missingPlanIdCount === 0,
  }
}

async function migrate(manager) {
  const report = await inspect(manager)
  if (!report.ready) throw new Error(`存在 ${report.missingPlanIdCount} 条缺少 planId 的旧状态，迁移已停止`)
  const details = []
  if (report.oldUniqueIndexExists) {
    await manager.database.updateCollection('user_problems', { DropIndexes: [{ IndexName: 'user_problem_unique' }] })
    details.push({ index: 'user_problem_unique', status: 'dropped' })
  } else {
    details.push({ index: 'user_problem_unique', status: 'absent' })
  }

  const indexDefinitions = [
    { name: 'user_plan_problem_unique', keys: { userId: 1, planId: 1, problemId: 1 }, unique: true },
    { name: 'plan_review_schedule', keys: { userId: 1, planId: 1, isSlashed: 1, nextReviewAt: 1 }, unique: false },
  ]
  for (const definition of indexDefinitions) {
    const exists = await manager.database.checkIndexExists('user_problems', definition.name)
    if (exists.Exists) {
      details.push({ index: definition.name, status: 'exists' })
      continue
    }
    await manager.database.updateCollection('user_problems', {
      CreateIndexes: [{
        IndexName: definition.name,
        MgoKeySchema: {
          MgoIndexKeys: Object.entries(definition.keys).map(([name, direction]) => ({ Name: name, Direction: String(direction) })),
          MgoIsUnique: definition.unique,
        },
      }],
    })
    details.push({ index: definition.name, status: 'created' })
  }
  return { success: true, mode: 'migrate', totalStates: report.totalStates, details }
}

exports.main = async (event = {}) => {
  try {
    const manager = getManager()
    if (event.action === 'inspect') return await inspect(manager)
    if (event.action === 'migrate') {
      if (event.confirm !== CONFIRM_TOKEN) return { success: false, message: '迁移需要明确确认参数', requiredConfirm: CONFIRM_TOKEN }
      return await migrate(manager)
    }
    return { success: false, message: '仅支持 inspect 或 migrate' }
  } catch (error) {
    console.error('计划维度状态迁移失败', error)
    return { success: false, message: '计划维度状态迁移失败', error: error.message }
  }
}
