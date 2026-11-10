import { translate, type Language } from '@shared/i18n'

function localeOf(language: Language): string {
  return language === 'en' ? 'en-US' : 'zh-CN'
}

function weekdayFormatter(language: Language): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeOf(language), { weekday: 'short' })
}

function dateFormatter(language: Language): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeOf(language), { month: 'long', day: 'numeric' })
}

function dateYearFormatter(language: Language): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeOf(language), {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function timeFormatter(language: Language): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeOf(language), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function parseDate(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

export function formatToday(
  date: Date,
  language: Language = 'zh-CN'
): { monthDay: string; weekday: string } {
  return {
    monthDay: dateFormatter(language).format(date),
    weekday: weekdayFormatter(language).format(date)
  }
}

export function formatNoteDateTitle(date: Date, language: Language = 'zh-CN'): string {
  if (language === 'en') return dateYearFormatter(language).format(date)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function formatTaskTime(iso: string, language: Language = 'zh-CN'): string {
  const date = parseDate(iso)
  if (!date) return translate(language, '时间未知')
  const now = new Date()
  const time = timeFormatter(language).format(date)
  if (isSameDay(date, now)) {
    return language === 'en' ? `Today ${time}` : `今天 ${time}`
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${dateFormatter(language).format(date)} ${time}`
  }
  return language === 'en'
    ? `${dateYearFormatter(language).format(date)} ${time}`
    : `${date.getFullYear()}年${dateFormatter(language).format(date)} ${time}`
}

export function formatArchiveTime(iso: string, language: Language = 'zh-CN'): string {
  const date = parseDate(iso)
  if (!date) return translate(language, '归档时间未知')
  const now = new Date()
  const time = timeFormatter(language).format(date)
  if (isSameDay(date, now)) {
    return language === 'en' ? `Archived today at ${time}` : `今天 ${time} 归档`
  }
  if (date.getFullYear() === now.getFullYear()) {
    return language === 'en'
      ? `Archived ${dateFormatter(language).format(date)} at ${time}`
      : `${dateFormatter(language).format(date)} ${time} 归档`
  }
  return language === 'en'
    ? `Archived ${dateYearFormatter(language).format(date)} at ${time}`
    : `${date.getFullYear()}年${dateFormatter(language).format(date)} ${time} 归档`
}

export function greeting(date: Date, language: Language = 'zh-CN'): string {
  const hour = date.getHours()
  if (language === 'en') {
    if (hour < 5) return 'Late night'
    if (hour < 11) return 'Good morning'
    if (hour < 14) return 'Good afternoon'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
