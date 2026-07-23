/**
 * 简单的WebSocket连接测试 - 尝试多个路径
 */

const paths = ['/ws', '/api/ws', '/']

for (const path of paths) {
  const WS_URL = `ws://localhost:17883${path}`
  console.log(`\n测试: ${WS_URL}`)
  
  await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL)
    
    ws.onopen = () => {
      console.log('  ✅ 连接成功!')
      ws.close()
      resolve()
    }
    
    ws.onerror = () => {
      console.log('  ❌ 连接失败')
      resolve()
    }
    
    ws.onclose = () => {
      // 等待一下再测试下一个路径
      setTimeout(resolve, 500)
    }
    
    setTimeout(() => {
      console.log('  ⏱️ 超时')
      ws.close()
      resolve()
    }, 3000)
  })
}

console.log('\n测试完成')
