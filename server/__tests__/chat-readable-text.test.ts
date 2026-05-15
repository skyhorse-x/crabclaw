import { describe, expect, it } from 'vitest'
import { ensureReadableText } from '../handlers/chat.handler'

describe('ensureReadableText', () => {
  it('extracts nested content from wrapped message JSON', () => {
    const raw = '{"type":"message","data":{"content":"你好，这是纯文本"}}'
    expect(ensureReadableText(raw)).toBe('你好，这是纯文本')
  })

  it('extracts readable content from mixed text containing JSON', () => {
    const raw = '抱歉让你困惑了。{"type":"message","data":{"content":"这是最终回复"}}'
    expect(ensureReadableText(raw)).toBe('这是最终回复')
  })

  it('extracts result from done envelopes', () => {
    const raw = '{"type":"done","data":{"result":"任务完成"}}'
    expect(ensureReadableText(raw)).toBe('任务完成')
  })

  it('unwraps quoted JSON strings recursively', () => {
    const raw = '"{\\"type\\":\\"message\\",\\"data\\":{\\"content\\":\\"递归解包成功\\"}}"'
    expect(ensureReadableText(raw)).toBe('递归解包成功')
  })

  it('extracts content from malformed envelope JSON', () => {
    const raw = '{"type":"message","data":{"content":"你好呀～😊 有什么需要帮忙的，尽管说～"}'
    expect(ensureReadableText(raw)).toBe('你好呀～😊 有什么需要帮忙的，尽管说～')
  })

  it('extracts content from malformed envelope JSON missing final brace', () => {
    const raw = '{"type":"message","data":{"content":"你好呀～😊 今天想让我帮你做点什么呢？"}'
    expect(ensureReadableText(raw)).toBe('你好呀～😊 今天想让我帮你做点什么呢？')
  })

  it('returns original text when no JSON content can be extracted', () => {
    const raw = '普通文本回复'
    expect(ensureReadableText(raw)).toBe(raw)
  })
})
