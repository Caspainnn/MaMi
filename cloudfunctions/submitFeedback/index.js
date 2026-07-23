const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const FEEDBACK_CATEGORIES = ['feature', 'bug', 'experience', 'praise', 'other']

async function getUser() {
  const { OPENID } = cloud.getWXContext()
  const result = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  if (!result.data[0]) throw new Error('未找到当前用户，请重新打开小程序后再试')
  return result.data[0]
}

exports.main = async (event = {}) => {
  try {
    const content = String(event.content || '').trim()
    const category = String(event.category || '')
    if (!content) return { success: false, message: '写点想对码秘说的话再提交吧' }
    if (!FEEDBACK_CATEGORIES.includes(category)) return { success: false, message: '请选择反馈分类' }
    if (content.length > 500) return { success: false, message: '反馈最多 500 字' }

    const user = await getUser()
    const created = await db.collection('user_feedback').add({
      data: {
        userId: user._id,
        category,
        content,
        status: 'unread',
        source: 'miniprogram',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
    return { success: true, feedbackId: created._id }
  } catch (error) {
    console.error('提交用户反馈失败', error)
    return { success: false, message: error.message || '提交失败，请稍后再试' }
  }
}
