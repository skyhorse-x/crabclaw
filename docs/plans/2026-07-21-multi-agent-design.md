# Multi-Agent 架构设计文档

> 创建时间：2026-07-21
> 状态：设计阶段

---

## 1. 整体架构

### 核心设计原则

1. **增量扩展**：在现有 Chat + Agent + Tool 架构上新增 Agent Runtime 层，不破坏现有功能
2. **动态配置**：Agent 类型、工具集、System Prompt 均可配置
3. **按需创建**：Agent 实例按需创建，用完即销毁
4. **结构化通信**：Agent 间通过结构化数据传递结果

### 架构分层

```
┌─────────────────────────────────────────────────────┐
│                    用户 (Frontend)                    │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              Chat Handler (现有)                     │
│         判断任务复杂度 → 单 Agent / 多 Agent          │
└─────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                              ▼
┌─────────────────┐          ┌─────────────────────────┐
│  Single Agent   │          │    Multi-Agent Runtime   │
│   (现有流程)     │          │                         │
└─────────────────┘          │  ┌───────────────────┐  │
                             │  │  Manager Agent    │  │
                             │  └────────┬──────────┘  │
                             │           ▼              │
                             │  ┌───────────────────┐  │
                             │  │  Task Planner     │  │
                             │  └────────┬──────────┘  │
                             │           ▼              │
                             │  ┌───────────────────┐  │
                             │  │  DAG Executor     │  │
                             │  └────────┬──────────┘  │
                             │           ▼              │
                             │  ┌───────────────────┐  │
                             │  │  Agent Pool       │  │
                             │  │  ├─ Frontend      │  │
                             │  │  ├─ Backend       │  │
                             │  │  ├─ Test          │  │
                             │  │  ├─ Review        │  │
                             │  │  └─ Security      │  │
                             │  └────────┬──────────┘  │
                             │           ▼              │
                             │  ┌───────────────────┐  │
                             │  │  Result Merger    │  │
                             │  └───────────────────┘  │
                             └─────────────────────────┘
```

### 触发条件

Manager Agent 自动判断是否启用多 Agent 模式：

- **单 Agent**：简单问答、单一文件操作、问候聊天
- **Multi-Agent**：涉及多个模块、需要并行处理、需要代码审查的复杂任务

---

## 2. 核心模块

### 2.1 Manager Agent

**职责**：
- 接收用户任务，分析复杂度
- 决定使用单 Agent 还是多 Agent 模式
- 多 Agent 模式下，调用 Planner 生成 DAG
- 监控执行进度，处理异常

**实现**：
```typescript
// server/agent-runtime/manager-agent.ts
class ManagerAgent {
  async execute(userMessage: string): Promise<AgentResult> {
    // 1. 分析任务复杂度
    const complexity = await this.analyzeComplexity(userMessage)
    
    // 2. 简单任务 → 直接走单 Agent 流程
    if (complexity.score < 0.5) {
      return await this.delegateToSingleAgent(userMessage)
    }
    
    // 3. 复杂任务 → 调用 Planner 生成 DAG
    const dag = await this.planner.plan(userMessage)
    
    // 4. 执行 DAG
    const results = await this.dagExecutor.execute(dag)
    
    // 5. 合并结果
    return await this.resultMerger.merge(results)
  }
}
```

### 2.2 Task Planner

**职责**：
- 接收复杂任务，拆解为子任务
- 定义子任务间的依赖关系（DAG）
- 为每个子任务分配合适的 Agent 类型

**输出格式**：
```typescript
interface TaskNode {
  id: string
  task: string
  agentType: AgentType
  deps: string[]          // 依赖的任务 ID
  context?: Record<string, unknown>  // 额外上下文
}

interface TaskDAG {
  nodes: TaskNode[]
  parallelism: number     // 最大并行度
}
```

### 2.3 DAG Executor

**职责**：
- 按拓扑排序执行 DAG 中的节点
- 并行执行无依赖的任务
- 传递任务间数据
- 收集执行结果

**核心逻辑**：
```typescript
class DAGExecutor {
  async execute(dag: TaskDAG, pool: AgentPool): Promise<TaskResult[]> {
    const results = new Map<string, TaskResult>()
    const ready = dag.nodes.filter(n => n.deps.length === 0)
    
    while (ready.length > 0) {
      // 并行执行所有就绪的任务
      const batch = await Promise.all(
        ready.map(node => pool.getAgent(node.agentType).execute(node, results))
      )
      
      // 收集结果
      batch.forEach((result, i) => results.set(ready[i].id, result))
      
      // 找出下一批就绪的任务
      ready.push(...dag.nodes.filter(n => 
        !results.has(n.id) && n.deps.every(d => results.has(d))
      ))
    }
    
    return Array.from(results.values())
  }
}
```

---

**这部分设计看起来正确吗？** 如果继续，我将设计 Agent Pool 和 Result Merger。
