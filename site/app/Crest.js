// A team's crest, or a placeholder with its initials until one is added.
const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function Crest({ name, src, size = 48, className = '' }) {
  const style = { width: size, height: size };
  return src
    ? <img className={`crest ${className}`} src={src} alt={`${name} crest`} style={style} />
    : <span className={`crest crest-empty ${className}`} style={{ ...style, fontSize: size * 0.36 }} aria-label={`${name} (no crest yet)`}>{initials(name)}</span>;
}
