const ws = new WebSocket('ws://localhost:17870/ws');

let step = 0;

ws.onopen = () => {
  console.log('✅ WebSocket 已连接\n');
  sendMessage1();
};

function sendMessage1() {
  console.log('📤 【第1步】发送: "打开百度"\n');
  ws.send(JSON.stringify({
    type: 'chat_message',
    payload: {
      message: '打开百度',
      taskId: 'memory-test-1',
      conversationHistory: []
    }
  }));
}

function sendMessage2() {
  console.log('\n📤 【第2步】发送: "在打开的浏览器里搜索小红书"\n');
  ws.send(JSON.stringify({
    type: 'chat_message',
    payload: {
      message: '在打开的浏览器里搜索小红书',
      taskId: 'memory-test-2',
      conversationHistory: [
        { role: 'user', text: '打开百度' },
        { role: 'assistant', text: '已为您打开百度浏览器' }
      ]
    }
  }));
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const payload = data.payload;

  switch (data.type) {
    case 'connected':
      console.log('📨 服务器消息:', payload.message);
      break;

    case 'stream_start':
      console.log('🔄 流式响应开始\n');
      break;

    case 'chat_chunk':
      handleChunk(payload);
      break;

    case 'stream_end':
      console.log('\n========== 【流式响应结束】==========\n');
      step++;
      if (step === 1) {
        console.log('⏳ 等待 5 秒后发送第二条消息...\n');
        setTimeout(sendMessage2, 5000);
      } else if (step >= 2) {
        console.log('✅ 测试完成！');
        ws.close();
        process.exit(0);
      }
      break;

    case 'error':
      console.log('❌ 错误:', payload);
      break;
  }
};

function handleChunk(payload) {
  switch (payload.type) {
    case 'reply':
      process.stdout.write(payload.reply || '');
      break;

    case 'reasoning':
      console.log('\n\n🤔 AI推理:', payload.reasoning?.text?.substring(0, 100) + '...');
      break;

    case 'mcp':
      const mcp = payload.mcp;
      console.log(`\n🔧 MCP调用: ${mcp.server}/${mcp.tool} [${mcp.status}]`);
      if (mcp.duration) console.log(`   ⏱️ 耗时: ${mcp.duration}ms`);
      if (mcp.result) console.log(`   📋 结果: ${JSON.stringify(mcp.result).substring(0, 150)}...`);
      if (mcp.error) console.log(`   ❌ 错误: ${mcp.error}`);
      break;

    case 'task':
      const task = payload.task;
      console.log(`\n📋 任务: ${task.title} [${task.status}]`);
      if (task.error) console.log(`   ❌ 错误: ${task.error}`);
      break;

    case 'detail':
      console.log(`\n📝 ${payload.detail?.stage}: ${payload.detail?.text}`);
      break;

    case 'usage':
      console.log(`\n💰 Token使用: ${payload.usage?.totalTokens}`);
      break;

    default:
      break;
  }
}

ws.onerror = (error) => {
  console.error('\n❌ WebSocket 错误:', error.message || error);
};

ws.onclose = () => {
  console.log('\n🔌 连接已关闭');
  process.exit(0);
};

// 180秒超时（足够长的测试时间）
setTimeout(() => {
  console.log('\n\n⏰ 总超时（180秒），强制关闭');
  ws.close();
  process.exit(0);
}, 180000);
