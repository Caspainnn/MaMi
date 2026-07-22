Page({
  data: { currentBank: {}, bankCode: '', keyword: '', categories: ['全部'], activeCategory: '全部', displayedProblems: [], isCloudData: false, needsPlan: false, loading: true },
  onShow() { this.loadActivePlan() },
  loadActivePlan() {
    this.setData({ loading: true, needsPlan: false, keyword: '', activeCategory: '全部' })
    wx.cloud.callFunction({ name: 'managePlan', data: { action: 'getActive' } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error('读取当前计划失败')
        if (!result.plan) return this.setData({ displayedProblems: [], categories: ['全部'], needsPlan: true, loading: false })
        this.setData({ bankCode: result.plan.questionBankCode, loading: false })
        this.loadCloudProblems()
      })
      .catch(() => this.setData({ displayedProblems: [], categories: ['全部'], needsPlan: true, loading: false }))
  },
  chooseCategory(e) { this.setData({ activeCategory: e.currentTarget.dataset.name }); this.loadCloudProblems() },
  search(e) {
    this.setData({ keyword: e.detail.value })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.loadCloudProblems(), 300)
  },
  onUnload() { clearTimeout(this.searchTimer) },
  loadCloudProblems() {
    const { keyword, activeCategory, bankCode } = this.data
    if (!bankCode) return
    wx.cloud.callFunction({ name: 'getQuestionBank', data: { action: 'list', bankCode, keyword, category: activeCategory === '全部' ? '' : activeCategory } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error('云端题库不可用')
        const displayedProblems = result.problems.map((item) => ({ ...item, difficultyClass: this.getDifficultyClass(item.difficulty), levelClass: 'lv0' }))
        this.setData({ currentBank: result.bank, categories: ['全部', ...result.categories], displayedProblems, isCloudData: true, needsPlan: false })
      })
      .catch(() => this.setData({ displayedProblems: [], isCloudData: false, needsPlan: true }))
  },
  getDifficultyClass(difficulty) { return ({ 简单: 'easy', 中等: 'medium', 困难: 'hard' })[difficulty] || 'medium' },
  openProblem(e) { wx.navigateTo({ url: `/pages/question-detail/index?id=${e.currentTarget.dataset.id}&bankCode=${this.data.bankCode}` }) },
  createPlan() { wx.navigateTo({ url: '/pages/plan-select-bank/index' }) },
})
