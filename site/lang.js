(() => {
  const STORAGE_KEY = 'fujian-language'
  const root = document.documentElement
  const page =
    root.dataset.page ||
    (location.pathname.toLowerCase().includes('privacy') ? 'privacy' : 'home')

  const copy = {
    home: {
      zh: {
        title: '浮笺 — 桌面待办便签',
        description:
          '浮笺是一个无边框的桌面任务便签。只显示标题，点击展开备注；也可以记录随记。支持 Windows 与 macOS。',
        ogTitle: '浮笺 — 桌面待办便签',
        ogDescription: '只显示标题的桌面任务便签，支持随记与多设备同步。',
        ogImage: 'assets/tasks-light.png'
      },
      en: {
        title: 'Fujian — Desktop to-do notes',
        description:
          'Fujian is a frameless desktop to-do note. Show titles only, click to open details, and keep quick notes in the same place. Available for Windows and macOS.',
        ogTitle: 'Fujian — Desktop to-do notes',
        ogDescription: 'A quiet desktop to-do note with quick notes and multi-device sync.',
        ogImage: 'assets/tasks-light-en.png'
      }
    },
    privacy: {
      zh: {
        title: '隐私 · 浮笺',
        description: '浮笺如何处理任务、随记、账户与 AI 关键词数据。'
      },
      en: {
        title: 'Privacy · Fujian',
        description: 'How Fujian handles tasks, notes, account data, and AI keywords.'
      }
    }
  }

  function storedLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved === 'zh' || saved === 'en' ? saved : ''
    } catch {
      return ''
    }
  }

  function browserLanguage() {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
    return String(languages[0] || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }

  function queryLanguage() {
    try {
      const value = new URLSearchParams(location.search).get('lang')
      return value === 'zh' || value === 'en' ? value : ''
    } catch {
      return ''
    }
  }

  const initialLanguage =
    queryLanguage() || storedLanguage() || browserLanguage()

  function setMeta(selector, value) {
    const element = document.querySelector(selector)
    if (element && value) element.setAttribute('content', value)
  }

  function updateMetadata(language) {
    const pageCopy = copy[page] || copy.home
    const text = pageCopy[language]
    document.title = text.title
    setMeta('meta[name="description"]', text.description)
    setMeta('meta[property="og:title"]', text.ogTitle || text.title)
    setMeta('meta[property="og:description"]', text.ogDescription || text.description)
    if (text.ogImage) setMeta('meta[property="og:image"]', text.ogImage)
  }

  function updateAttributes(language) {
    document.querySelectorAll('[data-aria-zh], [data-aria-en]').forEach((element) => {
      const value = element.dataset[language === 'en' ? 'ariaEn' : 'ariaZh']
      if (value) element.setAttribute('aria-label', value)
    })

    document.querySelectorAll('[data-alt-zh], [data-alt-en]').forEach((element) => {
      const value = element.dataset[language === 'en' ? 'altEn' : 'altZh']
      if (value) element.setAttribute('alt', value)
    })

    document.querySelectorAll('[data-src-zh], [data-src-en]').forEach((element) => {
      const source = element.dataset[language === 'en' ? 'srcEn' : 'srcZh']
      if (source && element.getAttribute('src') !== source) element.setAttribute('src', source)
    })

    document.querySelectorAll('[data-width-zh], [data-width-en]').forEach((element) => {
      const width = element.dataset[language === 'en' ? 'widthEn' : 'widthZh']
      if (width) element.setAttribute('width', width)
    })

    document.querySelectorAll('[data-height-zh], [data-height-en]').forEach((element) => {
      const height = element.dataset[language === 'en' ? 'heightEn' : 'heightZh']
      if (height) element.setAttribute('height', height)
    })
  }

  function updateSwitches(language) {
    document.querySelectorAll('[data-lang-button]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.langButton === language))
    })
  }

  function applyLanguage(language, persist = true) {
    const next = language === 'en' ? 'en' : 'zh'
    root.dataset.lang = next
    root.lang = next === 'zh' ? 'zh-CN' : 'en'
    updateMetadata(next)
    updateAttributes(next)
    updateSwitches(next)
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // The language still applies for this page when storage is unavailable.
      }
    }
    window.dispatchEvent(new CustomEvent('fujian:languagechange', { detail: { language: next } }))
  }

  root.dataset.lang = initialLanguage
  root.lang = initialLanguage === 'zh' ? 'zh-CN' : 'en'

  document.addEventListener('DOMContentLoaded', () => {
    updateMetadata(initialLanguage)
    updateAttributes(initialLanguage)
    updateSwitches(initialLanguage)
    document.querySelectorAll('[data-lang-button]').forEach((button) => {
      button.addEventListener('click', () => {
        const language = button.dataset.langButton
        if (language === 'zh' || language === 'en') applyLanguage(language)
      })
    })
    window.dispatchEvent(
      new CustomEvent('fujian:languagechange', { detail: { language: initialLanguage } })
    )
  })

  window.fujianSetLanguage = (language) => applyLanguage(language)
})()
