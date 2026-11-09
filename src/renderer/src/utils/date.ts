const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' })
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})
const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

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

export function formatToday(date: Date): { monthDay: string; weekday: string } {
  return {
    monthDay: dateFormatter.format(date),
    weekday: weekdayFormatter.format(date)
  }
}

export function formatNoteDateTitle(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function formatTaskTime(iso: string): string {
  const date = parseDate(iso)
  if (!date) return '时间未知'
  const now = new Date()
  const time = timeFormatter.format(date)
  if (isSameDay(date, now)) return `今天 ${time}`
  if (date.getFullYear() === now.getFullYear()) return `${dateFormatter.format(date)} ${time}`
  return `${date.getFullYear()}年${fullDateFormatter.format(date)}`
}

export function formatArchiveTime(iso: string): string {
  const date = parseDate(iso)
  if (!date) return '归档时间未知'
  const now = new Date()
  const time = timeFormatter.format(date)
  if (isSameDay(date, now)) return `今天 ${time} 归档`
  if (date.getFullYear() === now.getFullYear()) return `${dateFormatter.format(date)} ${time} 归档`
  return `${date.getFullYear()}年${fullDateFormatter.format(date)} 归档`
}

export function greeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
