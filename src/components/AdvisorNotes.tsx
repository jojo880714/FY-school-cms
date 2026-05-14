interface School {
  id: string;
  name: string;
}

interface Props {
  schools: School[];
  notes: Record<string, string>;
  onChange: (schoolId: string, note: string) => void;
}

export function AdvisorNotes({ schools, notes, onChange }: Props) {
  if (schools.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {schools.map((school) => {
        const note = notes[school.id] || '';
        const MAX = 300;
        return (
          <div key={school.id}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '6px',
              }}
            >
              對 <span style={{ color: '#111827' }}>{school.name}</span> 的備注
              <span style={{ color: '#9ca3af', fontWeight: '400' }}>
                {' '}
                （顯示在頁面上）
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <textarea
                value={note}
                onChange={(e) =>
                  onChange(school.id, e.target.value.slice(0, MAX))
                }
                rows={3}
                placeholder={`例如：${school.name} 特別適合想快速進步的學生...`}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '10px',
                  fontSize: '11px',
                  color: note.length > MAX * 0.9 ? '#f59e0b' : '#d1d5db',
                }}
              >
                {note.length}/{MAX}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
