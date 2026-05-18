/**
 * Shared status-pill cell renderer for AG Grid.
 *
 * Replaces scattered inline hex-coloured cellRenderers across feature pages
 * with a single token-aware helper. All colors come from CSS variables
 * defined in styles.scss.
 */

type Tone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'navy';

interface PillStyle {
  bg: string;
  fg: string;
  border: string;
}

const TONES: Record<Tone, PillStyle> = {
  neutral: {
    bg: 'var(--gv-surface-2)',
    fg: 'var(--gv-text-muted)',
    border: 'var(--gv-border-strong)',
  },
  success: {
    bg: 'var(--gv-success-soft)',
    fg: 'oklch(34% 0.14 152)',
    border: 'oklch(80% 0.10 152)',
  },
  warning: {
    bg: 'var(--gv-warning-soft)',
    fg: 'oklch(36% 0.14 75)',
    border: 'oklch(80% 0.13 75)',
  },
  danger: {
    bg: 'var(--gv-danger-soft)',
    fg: 'oklch(38% 0.19 25)',
    border: 'oklch(80% 0.14 25)',
  },
  info: {
    bg: 'var(--gv-info-soft)',
    fg: 'oklch(38% 0.13 240)',
    border: 'oklch(80% 0.10 240)',
  },
  accent: {
    bg: 'var(--gv-gold-soft)',
    fg: 'var(--gv-gold-deep)',
    border: 'oklch(80% 0.14 80)',
  },
  navy: {
    bg: 'var(--gv-navy-800)',
    fg: 'oklch(96% 0.005 250)',
    border: 'var(--gv-navy-600)',
  },
};

/**
 * Render a status pill for an AG Grid cell.
 * Pass a (value -> tone, label) map for the column.
 */
export function statusPillRenderer<T extends string>(
  map: Record<T, { tone: Tone; label: string }>,
): (params: { value: T }) => string {
  return (params) => {
    const v = params.value;
    const entry = (v != null ? map[v] : undefined) ?? {
      tone: 'neutral' as Tone,
      label: String(v ?? '—'),
    };
    return renderPill(entry.label, entry.tone);
  };
}

/** Render a pill HTML string for ad-hoc use. */
export function renderPill(label: string, tone: Tone = 'neutral'): string {
  const s = TONES[tone];
  return (
    `<span style="display:inline-flex;align-items:center;padding:2px 10px;` +
    `background:${s.bg};color:${s.fg};border:1px solid ${s.border};` +
    `font-size:11px;font-weight:600;letter-spacing:0.02em;` +
    `border-radius:999px;line-height:1.5;white-space:nowrap">` +
    `${escapeHtml(label)}</span>`
  );
}

/** Render an action button for an AG Grid cell. */
export function renderActionButton(
  label: string,
  testId?: string,
): string {
  return (
    `<button type="button" ${testId ? `data-testid="${testId}"` : ''} ` +
    `style="appearance:none;padding:4px 12px;background:var(--gv-gold);` +
    `color:var(--gv-navy-900);border:0;border-radius:var(--gv-radius);` +
    `font-size:12px;font-weight:600;cursor:pointer;` +
    `box-shadow:0 1px 2px oklch(58% 0.16 75 / 0.3)">${escapeHtml(label)}</button>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
