import {
  createContext,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode
} from 'react'
import { translate, type Language } from '@shared/i18n'

interface I18nValue {
  language: Language
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue>({
  language: 'zh-CN',
  t: (key, params) => translate('zh-CN', key, params)
})

export function I18nProvider({
  language,
  children
}: {
  language: Language
  children: ReactNode
}): ReactElement {
  const value = useMemo<I18nValue>(
    () => ({
      language,
      t: (key, params) => translate(language, key, params)
    }),
    [language]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
