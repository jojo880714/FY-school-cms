import { useState } from 'react';
import { FIELD_GROUPS } from '../types';

interface Props {
  selected: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
}

export function FieldSelector({ selected, onChange }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    費用資訊: true,
    城市與校區: true,
    課程資訊: false,
    學校特色: false,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {FIELD_GROUPS.map((group) => {
        const keys = group.fields.map((f) => f.key);
        const allChecked = keys.every((k) => selected[k]);
        const someChecked = keys.some((k) => selected[k]);
        const isOpen = open[group.label];
        return (
          <div
            key={group.label}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() =>
                setOpen((prev) => ({
                  ...prev,
                  [group.label]: !prev[group.label],
                }))
              }
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: '#f9fafb',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && someChecked;
                }}
                onChange={(e) => {
                  e.stopPropagation();
                  keys.forEach((k) => onChange(k, e.target.checked));
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: '#C41E3A' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '500', flex: 1 }}>
                {group.label}
              </span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                {keys.filter((k) => selected[k]).length}/{keys.length}
              </span>
              <span
                style={{
                  color: '#9ca3af',
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform .2s',
                  fontSize: '12px',
                }}
              >
                ▼
              </span>
            </button>
            {isOpen && (
              <div
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  background: 'white',
                }}
              >
                {group.fields.map((field) => (
                  <label
                    key={field.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#374151',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[field.key]}
                      onChange={(e) => onChange(field.key, e.target.checked)}
                      style={{ accentColor: '#C41E3A' }}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
