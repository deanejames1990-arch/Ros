import LoginForm from './LoginForm';

export const metadata = { title: 'Log in · Roscommon GAA Stats' };

export default function Login({ searchParams }) {
  const next = typeof searchParams.next === 'string' ? searchParams.next : '/';
  return (
    <div className="login card">
      <img src="/crest.png" alt="" className="login-crest" />
      <h1>Log in</h1>
      {searchParams.removed ? <p className="check warn small">Your access has been changed or removed. Log in again, or ask James for a new code.</p>
        : searchParams.need === 'admin' ? <p className="check warn small">That page needs an admin login.</p>
        : searchParams.need === 'tagger' ? <p className="check warn small">The live tagger needs a tagger or admin login.</p>
        : <p className="muted">Enter your personal access code (like ABCD-EFGH-JKLM), or the shared password.</p>}
      <LoginForm next={next} />
    </div>
  );
}
