const { problems, questionBanks } = require('../../services/mock-data')

Page({
  data: { problem: problems[0], bankName: questionBanks[0].name, activeTab: 'description', canPrev: false, canNext: true, previousProblemId: '', nextProblemId: '', bankCode: 'leetcode-hot-100', taskProblemIds: [], records: [], recordsLoading: false, expandedRecordId: '' },
  onLoad(options) {
    this.setData({ bankCode: options.bankCode || 'leetcode-hot-100' })
    const taskNavigation = getApp().globalData.taskNavigation
    if (options.context && taskNavigation && taskNavigation.bankCode === this.data.bankCode) this.setData({ taskProblemIds: taskNavigation.problemIds || [] })
    this.loadCloudProblem(options.id || String(problems[0].id))
  },
  onShow() {
    if (this.data.activeTab === 'records' && this.data.problem && this.data.problem.id) this.loadPracticeRecords()
  },
  loadCloudProblem(problemId) {
    wx.cloud.callFunction({ name: 'getQuestionBank', data: { action: 'detail', bankCode: this.data.bankCode, problemId } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error('云端题目不可用')
        const taskIndex = this.data.taskProblemIds.indexOf(result.problem.id)
        const hasTaskContext = taskIndex >= 0
        this.setData({ problem: result.problem, bankName: result.bank.name, previousProblemId: hasTaskContext ? this.data.taskProblemIds[taskIndex - 1] || '' : result.previousProblemId, nextProblemId: hasTaskContext ? this.data.taskProblemIds[taskIndex + 1] || '' : result.nextProblemId, canPrev: hasTaskContext ? taskIndex > 0 : Boolean(result.previousProblemId), canNext: hasTaskContext ? taskIndex < this.data.taskProblemIds.length - 1 : Boolean(result.nextProblemId), activeTab: 'description', records: [], expandedRecordId: '' })
      })
      .catch(() => this.setMockProblem(Number(problemId)))
  },
  setMockProblem(problemId) {
    const problem = problems.find((item) => item.id === problemId) || problems[0]
    const bank = questionBanks.find((item) => item.id === problem.bankId) || questionBanks[0]
    const bankProblems = problems.filter((item) => item.bankId === problem.bankId)
    const index = bankProblems.findIndex((item) => item.id === problem.id)
    this.setData({ problem, bankName: bank.name, canPrev: index > 0, canNext: index < bankProblems.length - 1, previousProblemId: index > 0 ? bankProblems[index - 1].id : '', nextProblemId: index < bankProblems.length - 1 ? bankProblems[index + 1].id : '', activeTab: 'description', records: [], expandedRecordId: '' })
  },
  previousProblem() { if (this.data.previousProblemId) this.loadCloudProblem(this.data.previousProblemId) },
  nextProblem() { if (this.data.nextProblemId) this.loadCloudProblem(this.data.nextProblemId) },
  selectTab(e) { const tab = e.currentTarget.dataset.tab; this.setData({ activeTab: tab, expandedRecordId: '' }); if (tab === 'records') this.loadPracticeRecords() },
  loadPracticeRecords() {
    if (!this.data.problem || !this.data.problem.id) return
    this.setData({ recordsLoading: true })
    wx.cloud.callFunction({ name: 'managePractice', data: { action: 'list', problemId: this.data.problem.id } })
      .then(({ result }) => this.setData({ records: result && result.success ? result.records : [], expandedRecordId: '' }))
      .catch(() => this.setData({ records: [] }))
      .finally(() => this.setData({ recordsLoading: false }))
  },
  expandRecord(e) { this.setData({ expandedRecordId: e.currentTarget.dataset.id }) },
  collapseRecords() { this.setData({ expandedRecordId: '' }) },
  slayProblem() {
    wx.showModal({
      title: '确认斩杀？',
      content: '斩杀后该题将直接升至 Lv5，并从后续新刷和复刷任务中移除；不会新增提交记录或打卡。',
      confirmText: '确认斩杀',
      confirmColor: '#d45b3f',
      success: ({ confirm }) => {
        if (!confirm) return
        wx.showLoading({ title: '正在斩杀' })
        wx.cloud.callFunction({ name: 'managePractice', data: { action: 'slay', problemId: this.data.problem.id } })
          .then(({ result }) => {
            if (!result || !result.success) throw new Error((result && result.error) || '斩杀失败')
            wx.showToast({ title: '已斩杀，Lv5', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 600)
          })
          .catch((error) => wx.showToast({ title: error.message || '斩杀失败，请重试', icon: 'none' }))
          .finally(() => wx.hideLoading())
      },
    })
  },
  copyLink() { wx.setClipboardData({ data: this.data.problem.link, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) }) },
  startPractice() { wx.navigateTo({ url: `/pages/practice-submit/index?id=${this.data.problem.id}&bankCode=${this.data.bankCode}` }) },
})
