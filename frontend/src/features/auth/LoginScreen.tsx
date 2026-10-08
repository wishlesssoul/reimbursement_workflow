import type { FormEvent } from 'react';

interface LoginScreenProps {
  email: string;
  password: string;
  message: string;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
}

export default function LoginScreen({
  email,
  password,
  message,
  onEmailChange,
  onPasswordChange,
  onLogin,
}: LoginScreenProps) {
  return (
    <div className="page-shell">
      <div className="panel login-panel">
        <h1>Reimbursement Review POC</h1>
        <p>Sign in with a seeded demo account.</p>
        <form onSubmit={onLogin}>
          <label>
            Email
            <input value={email} onChange={(event) => onEmailChange(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
          </label>
          <button type="submit">Login</button>
        </form>
        <div className="demo-accounts">
          <strong>Demo accounts:</strong>
          <ul>
            <li>customer1@example.com / Password123!</li>
            <li>reviewer1@example.com / Password123!</li>
            <li>admin@example.com / Password123!</li>
          </ul>
        </div>
        {message && <div className="status-box">{message}</div>}
      </div>
    </div>
  );
}