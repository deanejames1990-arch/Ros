import LoginForm from './LoginForm';

export const metadata = { title: 'Log in · Roscommon GAA Stats' };

export default function Login({ searchParams }) {
  const next = typeof searchParams.next === 'string' ? searchParams.next : '/';
  return (
    <div className="login card">
      <img src="/crest.png" alt="" className="login-crest" />
      <h1>Log in</h1>
      {searchParams.need === 'admin'
        ? <p className="check warn small">That page needs the admin password.</p>
        : <p className="muted">Use the viewer password to see the stats, or the admin password to add and manage games.</p>}
      <LoginForm next={next} />
    </div>
  );
}
