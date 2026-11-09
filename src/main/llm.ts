import { net, safeStorage } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { Note, NoteKeywordsResult } from '../shared/types'

const KEY_FILE = 'llm-key.bin'
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-chat'
const KEY_PATTERN = /^sk-[A-Za-z0-9_-]{16,}$/

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseKeywords(raw: string): string[] {
  const cleaned = raw
    .replace(/^关键词\s*[:：]\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
  const result: string[] = []
  const seen = new Set<string>()
  for (const part of cleaned.split(/[，,、;；\n\r\t ]+/)) {
    const keyword = part
      .replace(/^[-*#\d.、\s]+/, '')
      .replace(/[。.!！?？:：]+$/g, '')
      .trim()
      .slice(0, 16)
    if (!keyword || keyword.length > 16 || seen.has(keyword)) continue
    seen.add(keyword)
    result.push(keyword)
    if (result.length >= 6) break
  }
  return result
}

export class LlmService {
  private readonly keyPath: string
  private key = ''

  constructor(dataDir: string) {
    this.keyPath = join(dataDir, KEY_FILE)
    this.key = this.loadKey()
  }

  get configured(): boolean {
    return this.key.length > 0
  }

  setKey(value: string): void {
    const key = value.trim()
    if (!KEY_PATTERN.test(key)) {
      throw new Error('DeepSeek API Key 格式不正确，应以 sk- 开头。')
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全存储不可用，无法保存 API Key。')
    }
    const encrypted = safeStorage.encryptString(key)
    mkdirSync(dirname(this.keyPath), { recursive: true })
    const tmp = `${this.keyPath}.tmp`
    writeFileSync(tmp, encrypted, { mode: 0o600 })
    renameSync(tmp, this.keyPath)
    this.key = key
  }

  clearKey(): void {
    this.key = ''
    try {
      if (existsSync(this.keyPath)) unlinkSync(this.keyPath)
    } catch {
      // The in-memory key is gone either way.
    }
  }

  async generateKeywords(note: Note): Promise<NoteKeywordsResult> {
    if (!this.key) {
      return { ok: false, error: '请先在设置中填写 DeepSeek API Key。' }
    }

    const content = note.content.trim().slice(0, 6000)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    try {
      const response = await net.fetch(DEEPSEEK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.key}`
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          temperature: 0.2,
          max_tokens: 80,
          stream: false,
          messages: [
            {
              role: 'system',
              content:
                '你是中文笔记的关键词提取器。只输出 3 到 6 个简短关键词，用中文顿号分隔，不要解释、不要编号、不要引号。'
            },
            {
              role: 'user',
              content: `标题：${note.title}\n内容：${content || '（无正文）'}`
            }
          ]
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const status = response.status
        if (status === 401 || status === 403) {
          return { ok: false, error: 'DeepSeek API Key 无效或已过期。' }
        }
        if (status === 429) {
          return { ok: false, error: 'DeepSeek 请求太频繁，请稍后再试。' }
        }
        if (status === 402) {
          return { ok: false, error: 'DeepSeek 账户余额不足。' }
        }
        return { ok: false, error: `DeepSeek 请求失败（${status}）。` }
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>
      }
      const raw = data.choices?.[0]?.message?.content
      const keywords = typeof raw === 'string' ? parseKeywords(raw) : []
      if (keywords.length === 0) {
        return { ok: false, error: '模型没有返回关键词，请重试。' }
      }
      return { ok: true, keywords }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, error: 'DeepSeek 请求超时，请检查网络后重试。' }
      }
      const message = messageOf(error)
      if (message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network')) {
        return { ok: false, error: '网络连接失败，请检查网络后重试。' }
      }
      return { ok: false, error: `生成关键词失败：${message}` }
    } finally {
      clearTimeout(timeout)
    }
  }

  private loadKey(): string {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(this.keyPath)) return ''
    try {
      return safeStorage.decryptString(readFileSync(this.keyPath)).trim()
    } catch {
      try {
        unlinkSync(this.keyPath)
      } catch {
        // Ignore cleanup; the user can enter the key again.
      }
      return ''
    }
  }
}
