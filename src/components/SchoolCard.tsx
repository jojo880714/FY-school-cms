interface School {
  id: string;
  name: string;
  full_name: string;
  founded: number | null;
  english_only_policy: boolean;
}
interface Campus {
  id: string;
  school_id: string;
  city: string;
}
interface SchoolWithCampuses extends School {
  campuses: Campus[];
}

interface Props {
  school: SchoolWithCampuses;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function SchoolCard({ school, selected, disabled, onToggle }: Props) {
  const cities = [...new Set(school.campuses.map((c) => c.city))];
  return (
    <button
      onClick={onToggle}
      disabled={disabled && !selected}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: '12px',
        border: selected ? '2px solid #C41E3A' : '1px solid #e5e7eb',
        background: selected ? '#fdf0f2' : disabled ? '#f9fafb' : 'white',
        cursor: disabled && !selected ? 'not-allowed' : 'pointer',
        opacity: disabled && !selected ? 0.5 : 1,
        transition: 'all .15s',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}
          >
            <span
              style={{ fontWeight: '600', fontSize: '14px', color: '#111827' }}
            >
              {school.name}
            </span>
            {school.founded && (
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                est. {school.founded}
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: '12px',
              color: '#6b7280',
              margin: '0 0 8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {school.full_name}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {cities.map((city) => (
              <span
                key={city}
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '99px',
                  background: '#f3f4f6',
                  color: '#374151',
                }}
              >
                {city}
              </span>
            ))}
            {school.english_only_policy && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '99px',
                  background: '#d1fae5',
                  color: '#065f46',
                }}
              >
                English Only
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            border: selected ? 'none' : '1.5px solid #d1d5db',
            background: selected ? '#C41E3A' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {selected && (
            <span style={{ color: 'white', fontSize: '12px', lineHeight: 1 }}>
              ✓
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
