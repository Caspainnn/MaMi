const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const users = db.collection('users')
  let existing
  try {
    existing = await users.where({ openid: OPENID }).limit(1).get()
  } catch (error) {
    if (error && error.errCode === -502005) {
      return {
        needsSetup: true,
        message: '请先在云开发控制台创建 users 集合，并为 openid 建立唯一索引。',
      }
    }
    throw error
  }

  let user = existing.data[0]
  if (!user) {
    const now = db.serverDate()
    const created = await users.add({
      data: {
        openid: OPENID,
        nickname: 'MaMi 学习者',
        avatarUrl: '',
        registeredAt: now,
        streak: 0,
        totalPractices: 0,
        totalSlashed: 0,
        aiQuota: 0,
        createdAt: now,
        updatedAt: now,
      },
    })
    user = {
      _id: created._id,
      openid: OPENID,
      nickname: 'MaMi 学习者',
      streak: 0,
      totalPractices: 0,
      totalSlashed: 0,
      aiQuota: 0,
    }
  }

  return { user }
}
