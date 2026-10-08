import { type FormEvent, useEffect, useState } from 'react';
import {
  fetchMyRequests,
  fetchRequestByReference,
  submitCustomerResponse,
  submitRequest,
} from '../../api';
import type { RequestRecord } from '../../types';
import { eventSummary } from '../shared/requestEvents';

interface CustomerScreenProps {
  onMessage: (message: string) => void;
}

export default function CustomerScreen({ onMessage }: CustomerScreenProps) {
  const [customerReference, setCustomerReference] = useState('CUST-1001');
  const [expenseDate, setExpenseDate] = useState('2026-10-07');
  const [amountInr, setAmountInr] = useState('2500');
  const [description, setDescription] = useState('Travel to customer meeting');
  const [myRequests, setMyRequests] = useState<RequestRecord[]>([]);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [trackingReference, setTrackingReference] = useState('');
  const [trackedRequest, setTrackedRequest] = useState<RequestRecord | null>(null);

  useEffect(() => {
    fetchMyRequests().then(setMyRequests).catch(() => setMyRequests([]));
  }, []);

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onMessage('');

    try {
      const result = await submitRequest({
        customerReference,
        expenseDate,
        amountInr: Number(amountInr),
        description,
      });
      const requestReference = result.request.request_reference || result.request.id || 'N/A';
      onMessage(`${result.message} Reference: ${requestReference}`);
      setMyRequests(await fetchMyRequests());
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Submission failed.');
    }
  }

  async function handleCustomerResponse(event: FormEvent<HTMLFormElement>, item: RequestRecord) {
    event.preventDefault();
    const response = responseDrafts[item.id]?.trim();

    if (!response) {
      onMessage('Enter the requested information before submitting.');
      return;
    }

    try {
      const result = await submitCustomerResponse(item.id, response, item.version ?? 0);
      onMessage(result.message);
      setResponseDrafts((drafts) => ({ ...drafts, [item.id]: '' }));
      setMyRequests(await fetchMyRequests());
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Response submission failed.');
    }
  }

  async function handleTrackRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onMessage('');

    try {
      setTrackedRequest(await fetchRequestByReference(trackingReference.trim()));
    } catch (error) {
      setTrackedRequest(null);
      onMessage(error instanceof Error ? error.message : 'Request lookup failed.');
    }
  }

  async function handleViewRequest(item: RequestRecord) {
    const reference = item.request_reference || item.id;
    setTrackingReference(reference);
    try {
      setTrackedRequest(await fetchRequestByReference(reference));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Request details could not be loaded.');
    }
  }

  return (
    <div className="two-column">
      <section className="panel">
        <h3>Submit reimbursement request</h3>
        <form onSubmit={handleSubmitRequest} className="stack-form">
          <label>
            Customer reference
            <input value={customerReference} onChange={(event) => setCustomerReference(event.target.value)} required />
          </label>
          <label>
            Expense date
            <input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
          </label>
          <label>
            Amount in INR
            <input type="number" step="0.01" min="0.01" value={amountInr} onChange={(event) => setAmountInr(event.target.value)} required />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} required />
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
                {item.latest_review_explanation && <small>Reviewer note: {item.latest_review_explanation}</small>}
                <button type="button" className="detail-link" onClick={() => handleViewRequest(item)}>
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
                  <time dateTime={event.created_at}>{new Date(event.created_at || '').toLocaleString()}</time>
                  {eventSummary(event) && <small>{eventSummary(event)}</small>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
    </div>
  );
}