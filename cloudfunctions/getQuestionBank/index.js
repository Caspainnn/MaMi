const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const PAGE_SIZE = 100

async function getBank(bankCode) {
  const result = await db.collection('question_banks').where({ code: bankCode }).limit(1).get()
  return result.data[0]
}

async function getAllRelations(questionBankId) {
  const relations = []
  let offset = 0
  while (true) {
    const result = await db.collection('question_bank_problems')
      .where({ questionBankId })
      .orderBy('sortOrder', 'asc')
      .skip(offset)
      .limit(PAGE_SIZE)
      .get()
    relations.push(...result.data)
    if (result.data.length < PAGE_SIZE) return relations
    offset += PAGE_SIZE
  }
}

async function getProblems(problemIds) {
  const result = []
  for (let start = 0; start < problemIds.length; start += PAGE_SIZE) {
    const ids = problemIds.slice(start, start + PAGE_SIZE)
    const page = await db.collection('problems').where({ _id: db.command.in(ids) }).get()
    result.push(...page.data)
  }
  return result
}

function formatProblem(problem) {
  return {
    id: problem._id,
    number: problem.sourceProblemId,
    title: problem.title,
    difficulty: problem.difficulty,
    category: problem.category,
    tags: problem.tags || [],
    summary: problem.summary || '',
    link: problem.link || '',
  }
}

async function listProblems(bankCode, keyword = '', category = '') {
  const bank = await getBank(bankCode)
  if (!bank) return { success: false, message: '题库不存在' }

  const relations = await getAllRelations(bank._id)
  const records = await getProblems(relations.map((item) => item.problemId))
  const recordMap = records.reduce((map, item) => {
    map[item._id] = item
    return map
  }, {})
  const allProblems = relations
    .map((relation) => recordMap[relation.problemId])
    .filter(Boolean)
    .map(formatProblem)
  const normalizedKeyword = String(keyword).trim().toLowerCase()
  const problems = allProblems.filter((problem) => (
    (!category || problem.category === category)
    && (!normalizedKeyword || problem.title.toLowerCase().includes(normalizedKeyword))
  ))
  const categories = [...new Set(allProblems.map((item) => item.category).filter(Boolean))]

  return {
    success: true,
    bank: { id: bank._id, code: bank.code, name: bank.name, count: allProblems.length },
    categories,
    problems,
  }
}

exports.main = async (event = {}) => {
  try {
    const action = event.action || 'list'
    if (action === 'banks') {
      const result = await db.collection('question_banks').get()
      return {
        success: true,
        banks: result.data.map((bank) => ({
          id: bank._id,
          code: bank.code,
          name: bank.name,
          description: bank.description || '',
          count: bank.totalCount || 0,
        })),
      }
    }
    const bankCode = event.bankCode || 'leetcode-hot-100'
    const list = await listProblems(bankCode, event.keyword, event.category)
    if (!list.success || action === 'list') return list

    const index = list.problems.findIndex((item) => item.id === event.problemId)
    if (index < 0) return { success: false, message: '题目不存在或不属于当前题库' }
    return {
      success: true,
      bank: list.bank,
      problem: list.problems[index],
      previousProblemId: index > 0 ? list.problems[index - 1].id : '',
      nextProblemId: index < list.problems.length - 1 ? list.problems[index + 1].id : '',
    }
  } catch (error) {
    console.error('读取题库失败', error)
    return { success: false, message: '读取题库失败', error: error.message }
  }
}
