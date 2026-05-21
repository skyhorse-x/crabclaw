<script>
export default {
  onLaunch: function() {
    console.log('App Launch')
    this.checkSystemInfo()
  },
  onShow: function() {
    console.log('App Show')
  },
  onHide: function() {
    console.log('App Hide')
  },
  methods: {
    checkSystemInfo() {
      uni.getSystemInfo({
        success: (e) => {
          console.log('System Info:', e)
          let statusBarHeight = e.statusBarHeight
          let custom = e.custom || e.statusBarHeight
          console.log('Status Bar Height:', statusBarHeight)
          console.log('Custom:', custom)
        }
      })
    }
  }
}
</script>

<style>
page {
  background-color: #f7fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
}

view {
  box-sizing: border-box;
}
</style>
