export interface School {
  id: string;
  name: string;
  full_name: string;
  founded: number | null;
  website: string | null;
  nationality_count: number | null;
  english_only_policy: boolean;
  accreditation: string[] | null;
}

export interface Campus {
  id: string;
  school_id: string;
  city: string;
  address: string | null;
  campus_count: number;
  metro_station: string | null;
  walk_minutes: number | null;
  transit_system: string | null;
  monthly_pass_cad: number | null;
  student_count: string | null;
  highlight: string | null;
}

export interface GeneratedPage {
  id: string;
  slug: string;
  title: string | null;
  school_ids: string[];
  selected_fields: Record<string, boolean>;
  advisor_notes: Record<string, string>;
  html_url: string | null;
  public_url: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

export interface SchoolWithCampuses extends School {
  campuses: Campus[];
}

export const FIELD_GROUPS = [
  {
    label: '費用資訊',
    fields: [
      { key: 'tuition_weekly', label: '學費週費' },
      { key: 'housing_cost', label: '住宿費用' },
      { key: 'registration_fee', label: 'Registration Fee' },
      { key: 'living_cost', label: '生活費估算' },
    ],
  },
  {
    label: '城市與校區',
    fields: [
      { key: 'campus_address', label: '校區地址' },
      { key: 'metro_station', label: '最近地鐵站' },
      { key: 'transit_cost', label: '交通月票' },
      { key: 'city_highlights', label: '城市特色' },
    ],
  },
  {
    label: '課程資訊',
    fields: [
      { key: 'course_intensity', label: '課程強度' },
      { key: 'lesson_minutes', label: '每節課分鐘數' },
      { key: 'course_options', label: '課程類型' },
    ],
  },
  {
    label: '學校特色',
    fields: [
      { key: 'founded_year', label: '創立年份' },
      { key: 'accreditation', label: '認證機構' },
      { key: 'english_only', label: 'English Only 政策' },
    ],
  },
];

export const ALL_FIELD_KEYS = FIELD_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key)
);
