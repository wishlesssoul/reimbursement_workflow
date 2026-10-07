import { type FormEvent, useEffect, useState } from 'react';
import {
  fetchCurrentUser,
  fetchAdminUsers,
  fetchMyRequests,
  fetchReviewerQueue,
  fetchReviewerRequest,
  fetchRequestByReference,
  loginUser,
  logoutUser,
  seedDemoData,
  startReviewRequest,
  submitCustomerResponse,
  submitRequest,
  submitReviewDecision,
} from './api';
import type { AdminUser, RequestEvent, RequestRecord, User } from './types';

function eventSummary(event: RequestEvent) {
  if (!event.metadata) return '';

  try {
    const metadata = JSON.parse(event.metadata) as Record<string, string>;
    return metadata.explanation || metadata.reason || metadata.response || '';
  } catch {
    return '';
  }
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? (JSON.parse(storedUser) as User) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [email, setEmail] = useState('customer1@example.com');
  const [password, setPassword] = useState('Password123!');
  const [message, setMessage] = useState('');
  const [customerReference, setCustomerReference] = useState('CUST-1001');
  const [expenseDate, setExpenseDate] = useState('2026-10-07');
  const [amountInr, setAmountInr] = useState('2500');
  const [description, setDescription] = useState('Travel to customer meeting');
  const [myRequests, setMyRequests] = useState<RequestRecord[]>([]);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [reviewQueue, setReviewQueue] = useState<RequestRecord[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [queueStatus, setQueueStatus] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null);
  const [trackingReference, setTrackingReference] = useState('');
  const [trackedRequest, setTrackedRequest] = useState<RequestRecord | null>(null);
  const [decision, setDecision] = useState('approve');
  const [reviewExplanation, setReviewExplanation] = useState('Looks valid based on documentation.');

  useEffect(() => {
    if (!token) return;

    fetchCurrentUser().then((result) => setUser(result.user)).catch(() => {
      setUser(null);
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });
  }, [token]);

  useEffect(() => {
    if (!user || !token) return;

    if (user.role === 'Customer') {
      fetchMyRequests().then(setMyRequests).catch(() => setMyRequests([]));
    }

    if (user.role === 'Reviewer' || user.role === 'Admin') {
      fetchReviewerQueue(queueStatus || undefined).then(setReviewQueue).catch(() => setReviewQueue([]));
    }
    if (user.role === 'Admin') {
      fetchAdminUsers().then(setAdminUsers).catch(() => setAdminUsers([]));
    }
  }, [user, token, queueStatus]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    try {
      const result = await loginUser(email, password);
      setUser(result.user);
      setToken(result.token);
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      setMessage(`Logged in as ${result.user.role}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    }
  }

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    try {
      const result = await submitRequest({
        customerReference,
        expenseDate,
        amountInr: Number(amountInr),
        description,
      });
      const requestReference = result.request.request_reference || result.request.id || 'N/A';
      setMessage(`${result.message} Reference: ${requestReference}`);
      const nextRequests = await fetchMyRequests();
      setMyRequests(nextRequests);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Submission failed.');
    }
  }

  async function handleCustomerResponse(event: FormEvent<HTMLFormElement>, item: RequestRecord) {
    event.preventDefault();
    const response = responseDrafts[item.id]?.trim();

    if (!response) {
      setMessage('Enter the requested information before submitting.');
      return;
    }

    try {
      const result = await submitCustomerResponse(item.id, response, item.version ?? 0);
      setMessage(result.message);
      setResponseDrafts((drafts) => ({ ...drafts, [item.id]: '' }));
      setMyRequests(await fetchMyRequests());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Response submission failed.');
    }
  }

  async function handleTrackRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    try {
      const request = await fetchRequestByReference(trackingReference.trim());
      setTrackedRequest(request);
    } catch (error) {
      setTrackedRequest(null);
      setMessage(error instanceof Error ? error.message : 'Request lookup failed.');
    }
  }

  async function handleSelectReviewRequest(item: RequestRecord) {
    setSelectedRequestId(item.id);
    setMessage('');

    try {
      setSelectedRequest(await fetchReviewerRequest(item.id));
    } catch (error) {
      setSelectedRequest(null);
      setMessage(error instanceof Error ? error.message : 'Request details could not be loaded.');
    }
  }

  async function handleStartReview() {
    if (!selectedRequest) return;

    try {
      const result = await startReviewRequest(selectedRequest.id, selectedRequest.version ?? 0);
      setMessage(result.message);
      const [updatedRequest, queue] = await Promise.all([
        fetchReviewerRequest(selectedRequest.id),
        fetchReviewerQueue(queueStatus || undefined),
      ]);
      setSelectedRequest(updatedRequest);
      setReviewQueue(queue);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Review could not be started.');
    }
  }

  async function handleReviewDecision() {
    if (!selectedRequestId) {
      setMessage('Select a request to review first.');
      return;
    }

    try {
      const selectedRequest = reviewQueue.find((item) => item.id === selectedRequestId);
      const requestVersion = selectedRequest?.version ?? (await fetchReviewerRequest(selectedRequestId)).version ?? 0;
      const result = await submitReviewDecision(selectedRequestId, decision, reviewExplanation, requestVersion);
      setMessage(result.message);
      const [updatedRequest, queue] = await Promise.all([
        fetchReviewerRequest(selectedRequestId),
        fetchReviewerQueue(queueStatus || undefined),
      ]);
      setSelectedRequest(updatedRequest);
      setReviewQueue(queue);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Review failed.');
    }
  }

  async function handleSeed() {
    try {
      const result = await seedDemoData();
      setMessage(result.message);
      if (user?.role === 'Customer') {
        const nextRequests = await fetchMyRequests();
        setMyRequests(nextRequests);
      }
      if (user?.role === 'Reviewer' || user?.role === 'Admin') {
        const nextQueue = await fetchReviewerQueue();
        setReviewQueue(nextQueue);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Seed failed.');
    }
  }

  async function logout() {
    let logoutMessage = 'Logged out.';
    try {
      await logoutUser();
    } catch {
      logoutMessage = 'Local session cleared. The server session could not be revoked.';
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setMessage(logoutMessage);
  }

  if (!user) {
    return (
      <div className="page-shell">
        <div className="panel login-panel">
          <h1>Reimbursement Review POC</h1>
          <p>Sign in with a seeded demo account.</p>
          <form onSubmit={handleLogin}>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Reimbursement Review</h2>
          <small>{user.role} · {user.fullName}</small>
        </div>
        <button onClick={logout}>Logout</button>
      </header>

      {message && <div className="status-box">{message}</div>}

      {user.role === 'Customer' && (
        <div className="two-column">
          <section className="panel">
            <h3>Submit reimbursement request</h3>
            <form onSubmit={handleSubmitRequest} className="stack-form">
              <label>
                Customer reference
                <input value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} required />
              </label>
              <label>
                Expense date
                <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
              </label>
              <label>
                Amount in INR
                <input type="number" step="0.01" min="0.01" value={amountInr} onChange={(e) => setAmountInr(e.target.value)} required />
              </label>
              <label>
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required />
              </label>
              <button type="submit">Submit request</button>
            </form>
          </section>

          <section className="panel">
            <h3>My requests</h3>
            <form className="lookup-form" onSubmit={handleTrackRequest}>
              <label>
                Track by request reference
                <input
                  value={trackingReference}
                  onChange={(event) => setTrackingReference(event.target.value)}
                  placeholder="REQ-000123"
                  required
                />
              </label>
              <button type="submit" className="secondary">Find request</button>
            </form>
            {myRequests.length === 0 ? (
              <p>No requests yet.</p>
            ) : (
              <ul className="item-list">
                {myRequests.map((item) => (
                  <li key={item.id}>
                    <strong>{item.request_reference || item.id}</strong>
                    <span className="status-pill">{item.status}</span>
                    <small>{item.description}</small>
                    {item.latest_review_explanation && (
                      <small>Reviewer note: {item.latest_review_explanation}</small>
                    )}
                    <button type="button" className="detail-link" onClick={() => {
                      setTrackingReference(item.request_reference || item.id);
                      fetchRequestByReference(item.request_reference || item.id).then(setTrackedRequest).catch((error) => {
                        setMessage(error instanceof Error ? error.message : 'Request details could not be loaded.');
                      });
                    }}>
                      View status history
                    </button>
                    {(item.status === 'MoreInformationRequested' || item.status === 'AwaitingCustomerResponse') && (
                      <form className="stack-form" onSubmit={(event) => handleCustomerResponse(event, item)}>
                        <label>
                          Additional information
                          <textarea
                            value={responseDrafts[item.id] || ''}
                            onChange={(event) => setResponseDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                            rows={3}
                            required
                          />
                        </label>
                        <button type="submit">Send response</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {trackedRequest && (
              <section className="request-detail" aria-label="Request history">
                <h4>{trackedRequest.request_reference || trackedRequest.id} history</h4>
                <p><strong>Status:</strong> {trackedRequest.status}</p>
                <p><strong>Amount:</strong> INR {Number(trackedRequest.amount_inr || 0).toLocaleString('en-IN')}</p>
                <ol className="timeline">
                  {(trackedRequest.events || []).map((event) => (
                    <li key={event.id}>
                      <strong>{event.event_type}</strong>
                      <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                      {eventSummary(event) && <small>{eventSummary(event)}</small>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </section>
        </div>
      )}

      {(user.role === 'Reviewer' || user.role === 'Admin') && (
        <div className="two-column">
          <section className="panel">
            <h3>Reviewer queue</h3>
            <label className="queue-filter">
              Filter by status
              <select value={queueStatus} onChange={(event) => setQueueStatus(event.target.value)}>
                <option value="">All open requests</option>
                <option value="New">New</option>
                <option value="InReview">In review</option>
                <option value="AwaitingCustomerResponse">Awaiting customer</option>
                <option value="MoreInformationRequested">More info requested</option>
              </select>
            </label>
            {reviewQueue.length === 0 ? (
              <p>No requests in queue.</p>
            ) : (
              <ul className="item-list">
                {reviewQueue.map((item) => (
                  <li key={item.id}>
                    <button
                      className={selectedRequestId === item.id ? 'selected' : ''}
                      aria-pressed={selectedRequestId === item.id}
                      onClick={() => handleSelectReviewRequest(item)}
                    >
                      {item.request_reference || item.id} · {item.status}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h3>Decision panel</h3>
            {!selectedRequest && <p>Select a request from the queue to see its details.</p>}
            {selectedRequest && (
              <>
                <div className="request-detail">
                  <h4>{selectedRequest.request_reference || selectedRequest.id}</h4>
                  <p><strong>Status:</strong> {selectedRequest.status}</p>
                  <p><strong>Customer:</strong> {selectedRequest.customer_reference}</p>
                  <p><strong>Expense:</strong> {selectedRequest.description}</p>
                  <p><strong>Amount:</strong> INR {Number(selectedRequest.amount_inr || 0).toLocaleString('en-IN')}</p>
                  <ol className="timeline">
                    {(selectedRequest.events || []).map((event) => (
                      <li key={event.id}>
                        <strong>{event.event_type}</strong>
                        <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                        {eventSummary(event) && <small>{eventSummary(event)}</small>}
                      </li>
                    ))}
                  </ol>
                </div>
                {selectedRequest.status === 'New' && (
                  <button onClick={handleStartReview}>Start review</button>
                )}
                {selectedRequest.status === 'InReview' && (
                  <div className="decision-form">
                    <label>
                      Decision
                      <select value={decision} onChange={(event) => setDecision(event.target.value)}>
                        <option value="approve">Approve</option>
                        <option value="decline">Decline</option>
                        <option value="request-more-info">Request more info</option>
                      </select>
                    </label>
                    <label>
                      Explanation
                      <textarea value={reviewExplanation} onChange={(event) => setReviewExplanation(event.target.value)} rows={4} />
                    </label>
                    <button onClick={handleReviewDecision}>Submit decision</button>
                  </div>
                )}
                {(selectedRequest.status === 'MoreInformationRequested' || selectedRequest.status === 'AwaitingCustomerResponse') && (
                  <p>This request is waiting for the customer to provide more information.</p>
                )}
              </>
            )}
            {user.role === 'Admin' && (
              <button className="secondary" onClick={handleSeed}>Seed demo data</button>
            )}
          </section>
        </div>
      )}

      {user.role === 'Admin' && (
        <section className="panel admin-users-panel">
          <h3>Users</h3>
          {adminUsers.length === 0 ? (
            <p>No users available.</p>
          ) : (
            <ul className="item-list">
              {adminUsers.map((adminUser) => (
                <li key={adminUser.id}>
                  <strong>{adminUser.full_name}</strong>
                  <span className="status-pill">{adminUser.role}</span>
                  <small>{adminUser.email}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
