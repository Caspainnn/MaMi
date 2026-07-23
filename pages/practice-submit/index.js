const RECALL_OPTIONS = [
  { value: 'no_idea', label: '鼠鼠不会', hint: '没有思路，无法开始写' },
  { value: 'some_idea', label: '有点印象', hint: '有主要思路，但不能独立写完' },
  { value: 'almost', label: '差一捏捏', hint: '适用于 WA / CE / RE / TLE 或边界问题' },
  { value: 'independent', label: '独立通过', hint: '无需外部帮助，独立完成并 AC' },
]
const DURATION_OPTIONS = [
  { value: 'under_5', label: '<5 分钟' }, { value: '5_to_15', label: '5~15 分钟' },
  { value: '15_to_30', label: '15~30 分钟' }, { value: 'over_30', label: '>30 分钟' },
]
const LEVEL_TITLES = {
  Lv1: '一破·卧龙出山',
  Lv2: '双连·一战成名',
  Lv3: '三连·举世皆惊',
  Lv4: '四连·天下无敌',
  Lv5: '五连·诛天灭地',
}

function levelValue(level) { return Number(String(level || 'Lv0').replace('Lv', '')) || 0 }

Page({
  data: { problem: null, bankCode: '', recallOptions: RECALL_OPTIONS, durationOptions: DURATION_OPTIONS, recallResult: '', duration: '', code: '', summary: '', aiDraft: null, aiGenerating: false, submitting: false, successState: null },
  onLoad(options) {
    this.setData({ bankCode: options.bankCode || 'leetcode-hot-100' })
    wx.cloud.callFunction({ name: 'getQuestionBank', data: { action: 'detail', bankCode: this.data.bankCode, problemId: options.id } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error('题目读取失败')
        this.setData({ problem: result.problem })
      })
      .catch(() => wx.showToast({ title: '题目读取失败，请返回重试', icon: 'none' }))
  },
  chooseRecall(e) { this.setData({ recallResult: e.currentTarget.dataset.value, aiDraft: null }) },
  chooseDuration(e) { this.setData({ duration: e.currentTarget.dataset.value, aiDraft: null }) },
  updateCode(e) { this.setData({ code: e.detail.value, aiDraft: null }) },
  updateSummary(e) { this.setData({ summary: e.detail.value }) },
  generateSummary() {
    const { problem, recallResult, duration, code, summary, aiGenerating } = this.data
    if (aiGenerating || !problem) return
    if (!recallResult || !duration) return wx.showToast({ title: '请先选择刷题情况和耗时', icon: 'none' })
    this.setData({ aiGenerating: true })
    wx.cloud.callFunction({ name: 'generateAIAnalysis', data: { action: 'draft', problemId: problem.id, recallResult, duration, code, summary } })
      .then(({ result }) => {
        if (!result || !result.success || !result.analysis) throw new Error((result && result.message) || 'AI 生成失败')
        const analysis = result.analysis
        this.setData({ summary: [analysis.summary, analysis.suggestion].filter(Boolean).join('\n\n'), aiDraft: analysis })
      })
      .catch((error) => wx.showToast({ title: error.message || 'AI 生成失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ aiGenerating: false }))
  },
  submit() {
    const { problem, recallResult, duration, code, summary, aiDraft, submitting } = this.data
    if (submitting || !problem) return
    if (!recallResult || !duration) return wx.showToast({ title: '请选择回忆结果和耗时', icon: 'none' })
    this.setData({ submitting: true })
    wx.showLoading({ title: '正在保存' })
    wx.cloud.callFunction({ name: 'managePractice', data: { action: 'create', problemId: problem.id, recallResult, duration, code, summary, aiAnalysis: aiDraft } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error((result && result.error) || '保存失败')
        const { state } = result
        const before = levelValue(state.levelBefore)
        const after = levelValue(state.levelAfter)
        const successTitle = after > before
          ? LEVEL_TITLES[state.levelAfter]
          : after < before ? '死脑快记啊' : '记录已保存'
        this.setData({ successState: { ...state, successTitle, nextReviewText: state.nextReviewDays === 1 ? '明天' : `${state.nextReviewDays} 天后` } })
        wx.hideLoading()
      })
      .catch((error) => {
        wx.hideLoading()
        wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' })
      })
      .finally(() => this.setData({ submitting: false }))
  },
  closeSuccessModal() {
    const pages = getCurrentPages()
    const previousPage = pages[pages.length - 2]
    if (previousPage && previousPage.route === 'pages/question-detail/index') {
      previousPage.setData({ activeTab: 'records', expandedRecordId: '' })
      previousPage.loadPracticeRecords()
      wx.navigateBack()
      return
    }
    wx.redirectTo({ url: `/pages/question-detail/index?id=${this.data.problem.id}&bankCode=${this.data.bankCode}&tab=records` })
  },
})
