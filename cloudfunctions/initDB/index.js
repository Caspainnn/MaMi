const cloud = require('wx-server-sdk')
const CloudBase = require('@cloudbase/manager-node')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const DEFAULT_ENV_ID = 'cloud1-d7gwckvr53001d8bc'

const collections = [
  'users',
  'question_banks',
  'problems',
  'question_bank_problems',
  'study_plans',
  'plan_problems',
  'user_problems',
  'practice_records',
  'ai_analyses',
  'ai_usage',
  'daily_situations',
  'experience_libraries',
  'experience_refinement_logs',
  'user_feedback',
]

const indexes = [
  { collection: 'users', name: 'openid_unique', keys: { openid: 1 }, unique: true },
  { collection: 'question_banks', name: 'code_unique', keys: { code: 1 }, unique: true },
  { collection: 'problems', name: 'source_problem_unique', keys: { source: 1, sourceProblemId: 1 }, unique: true },
  { collection: 'question_bank_problems', name: 'bank_problem_unique', keys: { questionBankId: 1, problemId: 1 }, unique: true },
  { collection: 'question_bank_problems', name: 'bank_order_unique', keys: { questionBankId: 1, sortOrder: 1 }, unique: true },
  { collection: 'study_plans', name: 'user_status', keys: { userId: 1, status: 1 } },
  { collection: 'plan_problems', name: 'plan_problem_unique', keys: { planId: 1, problemId: 1 }, unique: true },
  { collection: 'plan_problems', name: 'plan_order_unique', keys: { planId: 1, planOrder: 1 }, unique: true },
  { collection: 'user_problems', name: 'user_plan_problem_unique', keys: { userId: 1, planId: 1, problemId: 1 }, unique: true },
  { collection: 'user_problems', name: 'plan_review_schedule', keys: { userId: 1, planId: 1, isSlashed: 1, nextReviewAt: 1 } },
  { collection: 'practice_records', name: 'user_submitted_at', keys: { userId: 1, submittedAt: -1 } },
  { collection: 'practice_records', name: 'problem_submitted_at', keys: { problemId: 1, submittedAt: -1 } },
  { collection: 'ai_analyses', name: 'record_unique', keys: { recordId: 1 }, unique: true },
  { collection: 'ai_analyses', name: 'user_date_status', keys: { userId: 1, date: 1, status: 1 } },
  { collection: 'ai_analyses', name: 'date_status', keys: { date: 1, status: 1 } },
  { collection: 'ai_usage', name: 'user_date_status', keys: { userId: 1, date: 1, status: 1 } },
  { collection: 'ai_usage', name: 'date_status', keys: { date: 1, status: 1 } },
  { collection: 'daily_situations', name: 'user_date_unique', keys: { userId: 1, date: 1 }, unique: true },
  { collection: 'experience_libraries', name: 'user_plan_unique', keys: { userId: 1, planId: 1 }, unique: true },
  { collection: 'experience_refinement_logs', name: 'user_plan_created', keys: { userId: 1, planId: 1, createdAt: -1 } },
  { collection: 'user_feedback', name: 'status_created', keys: { status: 1, createdAt: -1 } },
  { collection: 'user_feedback', name: 'user_created', keys: { userId: 1, createdAt: -1 } },
]

function getManager() {
  const context = cloud.getWXContext()
  return CloudBase.init({
    // 云函数运行时使用平台自动注入的临时凭证，不保存任何固定管理密钥。
    envId: context.ENV || process.env.TCB_ENV || DEFAULT_ENV_ID,
  })
}

async function ensureCollection(database, name, details) {
  const result = await database.checkCollectionExists(name)
  if (result.Exists) {
    details.push({ type: 'collection', name, status: 'exists' })
    return
  }
  await database.createCollection(name)
  details.push({ type: 'collection', name, status: 'created' })
}

async function ensureIndex(database, index, details) {
  const result = await database.checkIndexExists(index.collection, index.name)
  if (result.Exists) {
    details.push({ type: 'index', name: `${index.collection}.${index.name}`, status: 'exists' })
    return
  }
  await database.updateCollection(index.collection, {
    CreateIndexes: [{
      IndexName: index.name,
      MgoKeySchema: {
        MgoIndexKeys: Object.entries(index.keys).map(([name, direction]) => ({ Name: name, Direction: String(direction) })),
        MgoIsUnique: Boolean(index.unique),
      },
    }],
  })
  details.push({ type: 'index', name: `${index.collection}.${index.name}`, status: 'created' })
}

async function seedQuestionBanks(details) {
  const bankCollection = db.collection('question_banks')
  const banks = [
    { code: 'leetcode-hot-100', name: 'LeetCode Hot 100', description: '高频算法面试题精选', totalCount: 100 },
    { code: 'carl-algorithm', name: '代码随想录', description: '系统化算法训练题单', totalCount: 142 },
  ]

  for (const bank of banks) {
    const existing = await bankCollection.where({ code: bank.code }).limit(1).get()
    if (existing.data.length) {
      details.push({ type: 'seed', name: `question_banks.${bank.code}`, status: 'exists' })
      continue
    }
    await bankCollection.add({ data: { ...bank, createdAt: db.serverDate() } })
    details.push({ type: 'seed', name: `question_banks.${bank.code}`, status: 'created' })
  }
}

exports.main = async () => {
  const details = []
  try {
    const manager = getManager()
    for (const collection of collections) await ensureCollection(manager.database, collection, details)
    for (const index of indexes) await ensureIndex(manager.database, index, details)
    await seedQuestionBanks(details)
    return { success: true, message: '数据库初始化完成', details }
  } catch (error) {
    console.error('数据库初始化失败', error)
    return { success: false, message: '数据库初始化失败', error: error.message, details }
  }
}
