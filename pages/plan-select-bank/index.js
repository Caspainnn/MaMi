Page({
  data: { banks: [], selectedCode: '', loading: true },
  onLoad() {
    wx.cloud.callFunction({ name: 'getQuestionBank', data: { action: 'banks' } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error((result && result.message) || '题库读取失败')
        this.setData({ banks: result.banks, loading: false })
      })
      .catch((error) => {
        console.error('读取计划题库失败', error)
        this.setData({ loading: false })
        wx.showToast({ title: '题库读取失败，请检查云函数部署', icon: 'none' })
      })
  },
  chooseBank(e) { this.setData({ selectedCode: e.currentTarget.dataset.code }) },
  continueSetup() {
    if (!this.data.selectedCode) return
    wx.navigateTo({ url: `/pages/plan-select-goal/index?bankCode=${this.data.selectedCode}` })
  },
})
