'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { login } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Checking…' : 'Log in'}</button>;
}

export default function LoginForm({ next }) {
  const [state, action] = useFormState(login, null);
  return (
    <form action={action} className="login-form">
      <input type="hidden" name="next" value={next} />
      <label>
        Password
        <input type="password" name="password" autoFocus autoComplete="current-password" required />
      </label>
      {state?.error && <p className="check warn small">{state.error}</p>}
      <Submit />
    </form>
  );
}
