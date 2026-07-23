Page({
  data: { loading: true, plan: null, weekdays: ['一', '二', '三', '四', '五', '六', '日'], calendarDays: [], monthTitle: '', progressPercent: 0, totalPracticeCount: 0, streak: 0, slashedCount: 0, levelCounts: [] },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 2 })
    this.setData({ loading: true })
    wx.cloud.callFunction({ name: 'managePractice', data: { action: 'getStats' } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error('统计读取失败')
        this.setData({ ...result, loading: false })
      })
      .catch(() => this.setData({ loading: false, plan: null, levelCounts: [] }))
  },
})
