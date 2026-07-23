const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function normalizeNickname(value) {
  return String(value || '').trim().slice(0, 30)
}

exports.main = async (event = {}) => {
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

  if (event.action === 'status') {
    return {
      needsSetup: false,
      loggedIn: Boolean(user && user.profileAuthorized),
      user: user || null,
    }
  }

  if (event.action !== 'authorize') {
    return { success: false, message: '不支持的登录操作' }
  }

  const nickname = normalizeNickname(event.nickname)
  if (!nickname) return { success: false, message: '未获取到微信昵称，请允许昵称授权后重试' }

  if (!user) {
    const now = db.serverDate()
    const created = await users.add({
      data: {
        openid: OPENID,
        nickname,
        profileAuthorized: true,
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
      nickname,
      profileAuthorized: true,
      streak: 0,
      totalPractices: 0,
      totalSlashed: 0,
      aiQuota: 0,
    }
  } else {
    await users.doc(user._id).update({
      data: {
        nickname,
        profileAuthorized: true,
        updatedAt: db.serverDate(),
      },
    })
    user = { ...user, nickname, profileAuthorized: true }
  }

  return { success: true, loggedIn: true, user }
}
