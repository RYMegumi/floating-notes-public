import { useI18n } from '../i18n'

export type MainTab = 'tasks' | 'notes'

interface ViewSwitchProps {
  value: MainTab
  onChange: (value: MainTab) => void
}

export function ViewSwitch({ value, onChange }: ViewSwitchProps) {
  const { t } = useI18n()
  const options: Array<{ value: MainTab; label: string }> = [
    { value: 'tasks', label: t('待办') },
    { value: 'notes', label: t('随记') }
  ]

  return (
    <div className="main-switch">
      <div className="view-switch" role="tablist" aria-label={t('内容类型')}>
        <span
          className={`view-switch__thumb${value === 'notes' ? ' is-notes' : ''}`}
          aria-hidden="true"
        />
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={value === option.value}
            className={`view-switch__item${value === option.value ? ' is-active' : ''}`}
            onClick={() => {
              if (value !== option.value) onChange(option.value)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
