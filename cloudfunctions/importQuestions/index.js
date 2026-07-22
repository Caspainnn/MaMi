const cloud = require('wx-server-sdk')
const questions = require('./question-data')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数测试面板的调用等待时间较短。每批并发写入以减少网络往返，
// 同时保留确定性的文档 ID，使超时后再次执行仍可继续完成导入。
const DEFAULT_BATCH_SIZE = 10
const MAX_BATCH_SIZE = 100

async function getBanks() {
  const result = await db.collection('question_banks').get()
  return result.data.reduce((map, bank) => {
    map[bank.code] = bank
    return map
  }, {})
}

function getProblemId(question) {
  // 题号可能是“剑指 Offer 05”等文本，因此使用题库编码和 CSV 顺序生成稳定 ID。
  return `problem-${question.bankCode}-${question.sortOrder}`
}

function buildProblemPayload(question) {
  return {
    source: question.bankCode,
    sourceProblemId: question.sourceProblemId,
    title: question.title,
    difficulty: question.difficulty,
    category: question.category,
    tags: question.tags,
    summary: question.summary,
    link: question.link,
    updatedAt: db.serverDate(),
  }
}

async function saveProblem(question) {
  const problemId = getProblemId(question)
  const payload = buildProblemPayload(question)
  const reference = db.collection('problems').doc(problemId)

  // update() 在目标文档不存在时可能返回影响 0 条而不抛错，不能用于判断创建。
  // set() 使用稳定文档 ID：不存在则创建，存在则覆盖，重试也不会生成重复数据。
  await reference.set({ data: { ...payload, createdAt: db.serverDate() } })
  return { problemId }
}

async function saveRelation(bankId, problemId, sortOrder) {
  const relationId = `${bankId}_${problemId}`
  const reference = db.collection('question_bank_problems').doc(relationId)
  const payload = {
    questionBankId: bankId,
    problemId,
    sortOrder,
    updatedAt: db.serverDate(),
  }

  await reference.set({ data: { ...payload, createdAt: db.serverDate() } })
}

exports.main = async (event = {}) => {
  try {
    const banks = await getBanks()
    const bankOrder = ['leetcode-hot-100', 'carl-algorithm']
    const requestedBankCode = event.bankCode || 'next'
    const requestedLimit = Number.isInteger(event.limit) && event.limit > 0
      ? Math.min(event.limit, MAX_BATCH_SIZE)
      : DEFAULT_BATCH_SIZE

    const missingBanks = bankOrder.filter((code) => !banks[code])

    if (missingBanks.length) {
      return {
        success: false,
        message: '缺少默认题库，请先执行 initDB',
        missingBanks,
      }
    }

    let bankCode = requestedBankCode
    let selectedQuestions = []
    let start = Number.isInteger(event.start) && event.start >= 0 ? event.start : 0

    if (requestedBankCode === 'next') {
      // 默认模式：通过已写入题目数自动续传。每次只写一批，适配 3 秒测试窗口。
      for (const code of bankOrder) {
        const bankQuestions = questions.filter((item) => item.bankCode === code)
        const countResult = await db.collection('problems').where({ source: code }).count()
        if (countResult.total < bankQuestions.length) {
          bankCode = code
          start = countResult.total
          selectedQuestions = bankQuestions.slice(start, start + requestedLimit)
          break
        }
      }

      if (!selectedQuestions.length) {
        return {
          success: true,
          message: '全部题库已导入，无需继续执行',
          completed: true,
          total: questions.length,
        }
      }
    } else {
      const bankQuestions = questions.filter((item) => (
        requestedBankCode === 'all' || item.bankCode === requestedBankCode
      ))
      selectedQuestions = bankQuestions.slice(start, start + requestedLimit)
      if (!selectedQuestions.length) {
        return { success: false, message: '未找到符合条件的题目', bankCode: requestedBankCode, start }
      }
    }

    const result = {
      total: selectedQuestions.length,
      bankCode,
      writtenProblems: 0,
      relations: 0,
      batches: 0,
    }

    for (let batchStart = 0; batchStart < selectedQuestions.length; batchStart += MAX_BATCH_SIZE) {
      const batch = selectedQuestions.slice(batchStart, batchStart + MAX_BATCH_SIZE)

      // 先保存关联、后保存题目。续传游标以题目数为准，因此只要题目已出现，
      // 对应关联在该轮中就已经先被写入；中断后不会跳过关联数据。
      const problemIds = batch.map(getProblemId)
      await Promise.all(problemIds.map((problemId, index) => saveRelation(
        banks[batch[index].bankCode]._id,
        problemId,
        batch[index].sortOrder,
      )))
      const problemResults = await Promise.all(batch.map(saveProblem))

      for (const item of problemResults) {
        result.writtenProblems += 1
        result.relations += 1
      }
      result.batches += 1
    }

    // 导入后立即从同一云函数、同一环境回读，避免仅凭控制台视图判断写入结果。
    const verificationQuestions = selectedQuestions.slice(0, 10)
    const importedProblemIds = verificationQuestions.map(getProblemId)
    const importedRelationIds = verificationQuestions.map((question) => (
      `${banks[question.bankCode]._id}_${getProblemId(question)}`
    ))
    const [problemCheck, relationCheck, problemCount, relationCount] = await Promise.all([
      db.collection('problems').where({ _id: db.command.in(importedProblemIds) }).get(),
      db.collection('question_bank_problems').where({ _id: db.command.in(importedRelationIds) }).get(),
      db.collection('problems').count(),
      db.collection('question_bank_problems').count(),
    ])
    const isAutoContinue = requestedBankCode === 'next'
    const isLastBank = bankCode === bankOrder[bankOrder.length - 1]
    const currentBankTotal = questions.filter((item) => item.bankCode === bankCode).length
    const completed = isAutoContinue && isLastBank && start + selectedQuestions.length >= currentBankTotal
    const nextStart = start + selectedQuestions.length
    const nextEvent = isAutoContinue
      ? { bankCode: 'next', limit: requestedLimit }
      : { bankCode, start: nextStart, limit: requestedLimit }

    return {
      success: true,
      message: completed ? '全部题库导入完成' : '题库导入完成',
      ...result,
      completed,
      progress: completed ? undefined : {
        currentBankStart: start,
        currentBankEnd: nextStart,
        nextEvent,
        instruction: '请使用 nextEvent 作为下一次测试参数，继续导入下一批。',
      },
      verification: {
        envId: cloud.getWXContext().ENV || 'DYNAMIC_CURRENT_ENV',
        readableProblemsInSample: problemCheck.data.length,
        readableRelationsInSample: relationCheck.data.length,
        totalProblemsInThisEnv: problemCount.total,
        totalRelationsInThisEnv: relationCount.total,
      },
    }
  } catch (error) {
    console.error('题库导入失败', error)
    return { success: false, message: '题库导入失败', error: error.message }
  }
}
