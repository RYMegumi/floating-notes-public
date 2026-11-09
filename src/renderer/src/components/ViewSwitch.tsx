export type MainTab = 'tasks' | 'notes'

interface ViewSwitchProps {
  value: MainTab
  onChange: (value: MainTab) => void
}

const OPTIONS: Array<{ value: MainTab; label: string }> = [
  { value: 'tasks', label: '待办' },
  { value: 'notes', label: '随记' }
]

export function ViewSwitch({ value, onChange }: ViewSwitchProps) {
  return (
    <div className="main-switch">
      <div className="view-switch" role="tablist" aria-label="内容类型">
        <span
          className={`view-switch__thumb${value === 'notes' ? ' is-notes' : ''}`}
          aria-hidden="true"
        />
        {OPTIONS.map((option) => (
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
