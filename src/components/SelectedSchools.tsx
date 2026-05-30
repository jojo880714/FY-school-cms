import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface School {
  id: string;
  name: string;
  campuses: { city: string }[];
}

function SortableItem({
  school,
  index,
  onRemove,
}: {
  school: School;
  index: number;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: school.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'white',
        border: '1px solid #EAE5DD',
        borderRadius: '10px',
        padding: '10px 12px',
      }}
    >
      <button
        {...attributes}
        {...listeners}
        style={{
          cursor: 'grab',
          background: 'none',
          border: 'none',
          color: '#9ca3af',
          fontSize: '16px',
          padding: '0 2px',
          touchAction: 'none',
        }}
      >
        ⠿
      </button>
      <span
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#E8195A',
          color: 'white',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>
      <span style={{ fontSize: '13px', fontWeight: '500', flex: 1 }}>
        {school.name}
      </span>
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '0 2px',
        }}
      >
        ×
      </button>
    </div>
  );
}

interface Props {
  schools: School[];
  onReorder: (schools: any[]) => void;
  onRemove: (id: string) => void;
}

export function SelectedSchools({ schools, onReorder, onRemove }: Props) {
  const sensors = useSensors(useSensor(PointerSensor));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
          const oldIndex = schools.findIndex((s) => s.id === active.id);
          const newIndex = schools.findIndex((s) => s.id === over.id);
          onReorder(arrayMove(schools, oldIndex, newIndex));
        }
      }}
    >
      <SortableContext
        items={schools.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        {schools.length === 0 ? (
          <div
            style={{
              border: '1.5px dashed #EAE5DD',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
              從左側選擇 1–5 間學校
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {schools.map((school, index) => (
              <SortableItem
                key={school.id}
                school={school}
                index={index}
                onRemove={() => onRemove(school.id)}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </DndContext>
  );
}
