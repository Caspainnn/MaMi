function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    bank: null,
    planType: '',
    value: '',
    estimate: null,
    validationMessage: '',
    submitting: false,
  },
  onLoad(options) {
    wx.cloud.callFunction({ name: 'getQuestionBank', data: { action: 'banks' } })
      .then(({ result }) => {
        const bank = result && result.success && result.banks.find((item) => item.code === options.bankCode)
        if (!bank) throw new Error('题库不存在')
        this.setData({ bank })
      })
      .catch(() => wx.showToast({ title: '题库读取失败，请返回重试', icon: 'none' }))
  },
  chooseType(e) {
    this.setData({ planType: e.currentTarget.dataset.type, value: '', estimate: null, validationMessage: '' })
  },
  updateValue(e) {
    const value = e.detail.value.replace(/[^0-9]/g, '')
    this.setData({ value })
    this.calculateEstimate(value)
  },
  calculateEstimate(rawValue) {
    const value = Number(rawValue)
    const { bank, planType } = this.data
    if (!bank || !planType || !Number.isInteger(value) || value < 1) {
      this.setData({ estimate: null, validationMessage: '' })
      return
    }
    if (planType === 'by_days' && value < 15) {
      this.setData({ estimate: null, validationMessage: '达到 Lv5 需要经过第 15 天复习节点，目标天数不能少于 15 天。' })
      return
    }
    const newLearningDays = planType === 'by_days'
      ? value - 14
      : Math.ceil(bank.count / value)
    const dailyNewCount = Math.ceil(bank.count / newLearningDays)
    const targetDays = newLearningDays + 14
    const finishDate = new Date()
    finishDate.setDate(finishDate.getDate() + targetDays)
    const averageReviewCount = Math.ceil((bank.count * 4) / targetDays)
    this.setData({
      validationMessage: '',
      estimate: { dailyNewCount, averageReviewCount, targetDays, finishDate: formatDate(finishDate) },
    })
  },
  createPlan() {
    if (!this.data.estimate || this.data.submitting) return
    wx.showModal({
      title: '确认创建计划',
      content: `将创建 ${this.data.bank.name} 计划，并按题库顺序初始化全部题目。`,
      confirmText: '确认创建',
      success: ({ confirm }) => {
        if (!confirm) return
        this.setData({ submitting: true })
        wx.showLoading({ title: '正在创建计划' })
        wx.cloud.callFunction({
          name: 'managePlan',
          data: {
            action: 'create',
            bankCode: this.data.bank.code,
            planType: this.data.planType,
            value: Number(this.data.value),
          },
        }).then(({ result }) => {
          if (!result || !result.success) throw new Error((result && result.error) || '创建失败')
          wx.showToast({ title: '计划已创建', icon: 'success' })
          setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 600)
        }).catch((error) => wx.showToast({ title: error.message || '创建失败，请重试', icon: 'none' }))
          .finally(() => {
            wx.hideLoading()
            this.setData({ submitting: false })
          })
      },
    })
  },
})
