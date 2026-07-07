import { Link } from '@/lib/i18n/navigation';

interface FieldNode {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  level: number;
  children: unknown[];
  personCount?: number;
  _count?: { persons: number };
}

export function FieldTree({ fields }: { fields: FieldNode[] }) {
  if (!fields || fields.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No research fields defined yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {fields.map((field) => (
        <Link
          key={field.slug}
          href={`/field/${field.slug}`}
          className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {field.nameZh}
            </h3>
            {field._count && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>
                {field._count.persons}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">{field.nameEn}</p>
          {field.children && field.children.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(field.children as FieldNode[]).slice(0, 4).map((child) => (
                <span key={child.slug} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                  {child.nameZh}
                </span>
              ))}
              {field.children.length > 4 && (
                <span className="text-xs text-gray-400" style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif' }}>+{field.children.length - 4} more</span>
              )}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
