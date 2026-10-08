import { useState } from 'react';
import useAuthSession from './features/auth/useAuthSession';
import LoginScreen from './features/auth/LoginScreen';
import AdminScreen from './features/admin/AdminScreen';
import CustomerScreen from './features/customer/CustomerScreen';
import ReviewerScreen from './features/reviewer/ReviewerScreen';

function App() {
  const session = useAuthSession();
  const { user, message, setMessage } = session;
  const [reviewerRefreshKey, setReviewerRefreshKey] = useState(0);

  if (!user) {
    return (
      <LoginScreen
        email={session.email}
        password={session.password}
        message={message}
        onEmailChange={session.setEmail}
        onPasswordChange={session.setPassword}
        onLogin={session.login}
      />
    );
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Reimbursement Review</h2>
          <small>{user.role} · {user.fullName}</small>
        </div>
        <button onClick={session.logout}>Logout</button>
      </header>

      {message && <div className="status-box">{message}</div>}

      {user.role === 'Customer' && (
        <CustomerScreen onMessage={setMessage} />
      )}

      {(user.role === 'Reviewer' || user.role === 'Admin') && (
        <ReviewerScreen onMessage={setMessage} refreshKey={reviewerRefreshKey} />
      )}

      {user.role === 'Admin' && (
        <AdminScreen onMessage={setMessage} onSeeded={() => setReviewerRefreshKey((key) => key + 1)} />
      )}
    </div>
  );
}

export default App;
