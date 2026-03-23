/**
 * 技能相关类型定义
 */

/**
 * 技能步骤类型
 */
export type SkillStepType = 
  | 'openApp'
  | 'openUrl'
  | 'click'
  | 'doubleClick'
  | 'rightClick'
  | 'type'
  | 'paste'
  | 'key'
  | 'hotkey'
  | 'wait'
  | 'scroll'
  | 'move'
  | 'noop'
  | 'note'
  | 'chat'

/**
 * 技能步骤
 */
export interface SkillStep {
  type: SkillStepType
  label?: string
  target?: string
  x?: number
  y?: number
  text?: string
  app?: string
  url?: string
  key?: string
  keys?: string[]
  dx?: number
  dy?: number
  ms?: number
  note?: string
}

/**
 * 技能分类
 */
export type SkillCategory = 'browser' | 'desktop' | 'emulator'

/**
 * 技能配置
 */
export interface SkillConfig {
  id: string
  name: string
  category: SkillCategory
  description: string
  tags: string[]
  triggerPhrases: string[]
  delayMs: number
  steps: SkillStep[]
  skillFile?: string
}

/**
 * 支持的技能操作
 */
export const SUPPORTED_ACTIONS: readonly SkillStepType[] = [
  'openApp',
  'openUrl',
  'move',
  'click',
  'doubleClick',
  'rightClick',
  'type',
  'paste',
  'key',
  'hotkey',
  'wait',
  'scroll',
  'noop',
  'note',
  'chat'
] as const
