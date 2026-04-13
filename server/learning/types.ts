/**
 * 学习系统类型定义
 */

export interface ExecutedStep {
  id: string
  tool: string
  server: string
  args: Record<string, any>
  success: boolean
  result?: any
  error?: string
  duration: number
  timestamp: number
}

export interface ExecutionRecord {
  taskId: string
  goal: string
  steps: ExecutedStep[]
  overallSuccess: boolean
  duration: number
  timestamp: number
  context?: Record<string, any>
}

export interface CausalNode {
  id: string
  action: string
  result: 'success' | 'failure' | 'neutral'
  cause: string
  effect: string
  children: CausalNode[]
  confidence: number
}

export interface FailurePoint {
  stepId: string
  errorType: string
  errorMessage: string
  rootCause: string
  severity: 'critical' | 'major' | 'minor'
  recoverable: boolean
}

export interface SuccessFactor {
  stepId: string
  description: string
  importance: number
}

export interface ConditionalRule {
  id: string
  condition: string
  conditionVector: number[]
  action: string
  successRate: number
  sampleCount: number
  source: string
  lastValidated: number
  active: boolean
}

export interface DeepReflection {
  record: ExecutionRecord
  causalChain: CausalNode[]
  successFactors: SuccessFactor[]
  failurePoints: FailurePoint[]
  conditionalRules: ConditionalRule[]
  alternativeApproaches: string[]
  confidence: number
  timestamp: number
}

export interface ReflectionResult {
  taskId: string
  summary: string
  errorPatterns: string[]
  suggestions: string[]
  learnedLessons: string[]
  shouldRetry: boolean
  improvedApproach?: string
  deepAnalysis?: DeepReflection
}

export interface ExperienceNode {
  id: string
  taskType: string
  taskDescription: string
  graph: {
    nodes: GraphNode[]
    edges: GraphEdge[]
  }
  embedding: number[]
  successRate: number
  totalAttempts: number
  lastAttempt: number
  avgDuration: number
  tags: string[]
  metadata: Record<string, any>
}

export interface GraphNode {
  id: string
  type: 'action' | 'state' | 'condition' | 'result'
  name: string
  properties?: Record<string, any>
}

export interface GraphEdge {
  from: string
  to: string
  condition?: string
  probability?: number
}

export interface ExperienceSearchResult {
  experience: ExperienceNode
  similarity: number
  matchedTags: string[]
}

export interface SuccessPattern {
  id: string
  name: string
  description: string
  trigger: {
    taskTypes: string[]
    keywords: string[]
    contextPreconditions?: string[]
  }
  structure: {
    steps: PatternStep[]
    alternatives?: Alternative[]
    fallbacks?: Fallback[]
  }
  effectiveness: {
    successRate: number
    avgDuration: number
    sampleSize: number
    lastValidated: number
    trend: 'improving' | 'stable' | 'declining'
  }
  applicability: {
    domains: string[]
    limitations: string[]
    confidence: number
  }
}

export interface PatternStep {
  sequence: number
  action: string
  expectedResult: string
  timeout: number
  critical: boolean
  retryable: boolean
}

export interface Alternative {
  id: string
  name: string
  steps: PatternStep[]
  whenToUse: string
  successRate?: number
}

export interface Fallback {
  trigger: string
  recoveryAction: string
  description: string
}

export interface FailurePattern {
  id: string
  errorType: string
  symptoms: string[]
  rootCauses: RootCause[]
  solutions: Solution[]
  prevention: string[]
}

export interface RootCause {
  category: 'resource' | 'permission' | 'network' | 'input' | 'state' | 'unknown'
  description: string
  frequency: number
}

export interface Solution {
  action: string
  successRate: number
  attempts: number
  lastAttempt?: number
}

export interface Strategy {
  id: string
  name: string
  type: 'planning' | 'execution' | 'recovery'
  rules: StrategyRule[]
  performance: StrategyPerformance
  conditions: string[]
  createdAt: number
  updatedAt: number
}

export interface StrategyRule {
  id: string
  condition: string
  action: string
  priority: number
  confidence: number
  source: 'learned' | 'manual' | 'derived'
}

export interface StrategyPerformance {
  totalAttempts: number
  successCount: number
  avgDuration: number
  recentResults: boolean[]
  maxRecentResults: number
  trend: 'improving' | 'stable' | 'declining'
  lastUpdated: number
}

export interface LearningOutcome {
  reflection: DeepReflection
  newPatterns: SuccessPattern[]
  updatedStrategies: Strategy[]
  appliedRules: ConditionalRule[]
  timestamp: number
}

export interface AppliedKnowledge {
  plan: any
  knowledgeSources: {
    experiences: ExperienceSearchResult[]
    patterns: SuccessPattern[]
    strategies: Strategy[]
  }
  confidence: number
}

export interface OptimizationReport {
  analyzedStrategies: number
  problematicStrategies: Strategy[]
  suggestedImprovements: string[]
  autoOptimized: number
  pendingReview: number
  timestamp: number
}

export interface LearningConfig {
  enableDeepReflection: boolean
  enablePatternExtraction: boolean
  enableStrategyOptimization: boolean
  enableAutoOptimization: boolean
  autoOptimizationInterval: number
  minSampleSizeForPattern: number
  confidenceThreshold: number
  maxPatternsPerCategory: number
  maxStrategies: number
  retentionPeriod: number
}

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enableDeepReflection: true,
  enablePatternExtraction: true,
  enableStrategyOptimization: true,
  enableAutoOptimization: false,
  autoOptimizationInterval: 24 * 60 * 60 * 1000,
  minSampleSizeForPattern: 3,
  confidenceThreshold: 0.7,
  maxPatternsPerCategory: 50,
  maxStrategies: 100,
  retentionPeriod: 30 * 24 * 60 * 60 * 1000
}
