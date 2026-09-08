import type { LucideIcon } from 'lucide-react';

export function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'default',
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'success' | 'warning';
}>) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <div className="summary-icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}
