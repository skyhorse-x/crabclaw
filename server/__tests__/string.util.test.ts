import { describe, it, expect } from 'vitest'
import { normalizeText, slugify, truncate, startsWith, endsWith } from '../shared/utils/string.util'

describe('String Utilities', () => {
  describe('normalizeText', () => {
    it('should trim whitespace from strings', () => {
      expect(normalizeText('  hello  ')).toBe('hello')
    })

    it('should return empty string for null/undefined', () => {
      expect(normalizeText(null)).toBe('')
      expect(normalizeText(undefined)).toBe('')
    })

    it('should convert non-strings to string', () => {
      expect(normalizeText(123)).toBe('123')
      expect(normalizeText({})).toBe('[object Object]')
    })
  })

  describe('slugify', () => {
    it('should convert to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world')
    })

    it('should replace spaces with hyphens', () => {
      expect(slugify('hello world')).toBe('hello-world')
    })

    it('should remove special characters', () => {
      expect(slugify('hello@world!')).toBe('hello-world')
    })

    it('should handle Chinese characters', () => {
      expect(slugify('你好世界')).toBe('你好世界')
    })
  })

  describe('truncate', () => {
    it('should truncate long text', () => {
      const longText = 'a'.repeat(100)
      const result = truncate(longText, 50)
      expect(result.length).toBe(50)
      expect(result.endsWith('...')).toBe(true)
    })

    it('should not truncate short text', () => {
      const shortText = 'Hello'
      expect(truncate(shortText, 10)).toBe('Hello')
    })

    it('should use default suffix', () => {
      const text = 'Hello World'
      const result = truncate(text, 5)
      expect(result).toBe('He...')
    })
  })

  describe('startsWith', () => {
    it('should check string prefix', () => {
      expect(startsWith('Hello World', 'Hello')).toBe(true)
      expect(startsWith('Hello World', 'World')).toBe(false)
    })
  })

  describe('endsWith', () => {
    it('should check string suffix', () => {
      expect(endsWith('Hello World', 'World')).toBe(true)
      expect(endsWith('Hello World', 'Hello')).toBe(false)
    })
  })
})
