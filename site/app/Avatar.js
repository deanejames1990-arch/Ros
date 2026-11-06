// A person's photo, or their initials until one is added.
const initials = (name = '') => String(name).trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export default function Avatar({ name, src, size = 26, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  return src
    ? <img className={`avatar ${className}`} src={src} alt="" style={style} />
    : <span className={`avatar avatar-empty ${className}`} style={style} aria-hidden="true">{initials(name)}</span>;
}
