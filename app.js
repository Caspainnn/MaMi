App({
  globalData: {
    cloudEnvId: 'cloud1-d7gwckvr53001d8bc',
    // 题库展示仍使用阶段 1 演示数据；用户身份已接入云开发。
    user: {
      nickname: 'MaMi 学习者',
      streak: 0,
      totalPractices: 0,
    },
    loginStatus: { available: false, loggedIn: false },
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发能力')
      return
    }

    wx.cloud.init({
      env: this.globalData.cloudEnvId,
      traceUser: true,
    })

    this.globalData.loginPromise = wx.cloud.callFunction({ name: 'login', data: { action: 'status' } })
      .then(({ result }) => {
        if (result && result.needsSetup) {
          console.warn(result.message)
          this.globalData.loginStatus = { available: false, loggedIn: false }
          return this.globalData.user
        }
        this.globalData.loginStatus = { available: true, loggedIn: Boolean(result && result.loggedIn) }
        if (result && result.loggedIn && result.user) {
          this.globalData.user = result.user
        }
        return this.globalData.user
      })
      .catch((error) => {
        // 云函数未部署或网络异常时保留演示身份，保证阶段 1 页面可预览。
        console.warn('云登录暂不可用，已使用演示身份', error)
        this.globalData.loginStatus = { available: false, loggedIn: false }
        return this.globalData.user
      })
  },
})
