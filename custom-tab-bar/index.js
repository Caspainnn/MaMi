Component({
  data: { selected: 0, items: [
    { path: '/pages/home/index', text: '首页', icon: '/assets/icons/tab-home.svg' },
    { path: '/pages/question-bank/index', text: '题库', icon: '/assets/icons/tab-bank.svg' },
    { path: '/pages/stats/index', text: '统计', icon: '/assets/icons/tab-stats.svg' },
    { path: '/pages/experience/index', text: '经验', icon: '/assets/icons/tab-experience.svg' },
    { path: '/pages/profile/index', text: '我的', icon: '/assets/icons/tab-profile.svg' },
  ] },
  lifetimes: { attached() { this.updateSelected() } },
  pageLifetimes: { show() { this.updateSelected() } },
  methods: {
    updateSelected() {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      const route = current ? `/${current.route}` : ''
      const selected = this.data.items.findIndex((item) => item.path === route)
      this.setData({ selected: selected < 0 ? 0 : selected })
    },
    switchTab(event) {
      const path = event.currentTarget.dataset.path
      wx.switchTab({ url: path })
    },
  },
})
