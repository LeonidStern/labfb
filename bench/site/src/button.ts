// Button styles used across the site.
export type Variant = 'primary' | 'ghost';

export const base = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 15,
  lineHeight: 1.2,
};

export const variants: Record<Variant, object> = {
  primary: {
    background: '#111',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: 999,
  },
  ghost: {
    background: 'transparent',
    color: '#111',
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid #ddd',
  },
};
