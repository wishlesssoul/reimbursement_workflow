import { useEffect, useState } from 'react';
import {
  fetchReviewerQueue,
  fetchReviewerRequest,
  startReviewRequest,
  submitReviewDecision,
} from '../../api';
import type { RequestRecord } from '../../types';
import { eventSummary } from '../shared/requestEvents';

interface ReviewerScreenProps {
  onMessage: (message: string) => void;
  refreshKey: number;
}

export default function ReviewerScreen({ onMessage, refreshKey }: ReviewerScreenProps) {
  const [reviewQueue, setReviewQueue] = useState<RequestRecord[]>([]);
  const [queueStatus, setQueueStatus] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null);
  const [decision, setDecision] = useState('approve');
  const [reviewExplanation, setReviewExplanation] = useState('Looks valid based on documentation.');

  useEffect(() => {
    fetchReviewerQueue(queueStatus || undefined).then(setReviewQueue).catch(() => setReviewQueue([]));
  }, [queueStatus, refreshKey]);

  async function handleSelectRequest(item: RequestRecord) {
    setSelectedRequestId(item.id);
    onMessage('');

    try {
      setSelectedRequest(await fetchReviewerRequest(item.id));
    } catch (error) {
      setSelectedRequest(null);
      onMessage(error instanceof Error ? error.message : 'Request details could not be loaded.');
    }
  }

  async function handleStartReview() {
    if (!selectedRequest) return;

    try {
      const result = await startReviewRequest(selectedRequest.id, selectedRequest.version ?? 0);
      onMessage(result.message);
      const [updatedRequest, queue] = await Promise.all([
        fetchReviewerRequest(selectedRequest.id),
        fetchReviewerQueue(queueStatus || undefined),
      ]);
      setSelectedRequest(updatedRequest);
      setReviewQueue(queue);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Review could not be started.');
    }
  }

  async function handleReviewDecision() {
    if (!selectedRequestId) {
      onMessage('Select a request to review first.');
      return;
    }

    try {
      const queueItem = reviewQueue.find((item) => item.id === selectedRequestId);
      const requestVersion = queueItem?.version ?? (await fetchReviewerRequest(selectedRequestId)).version ?? 0;
      const result = await submitReviewDecision(selectedRequestId, decision, reviewExplanation, requestVersion);
      onMessage(result.message);
      const [updatedRequest, queue] = await Promise.all([
        fetchReviewerRequest(selectedRequestId),
        fetchReviewerQueue(queueStatus || undefined),
      ]);
      setSelectedRequest(updatedRequest);
      setReviewQueue(queue);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Review failed.');
    }
  }

  return (
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
                  onClick={() => handleSelectRequest(item)}
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
                    <time dateTime={event.created_at}>{new Date(event.created_at || '').toLocaleString()}</time>
                    {eventSummary(event) && <small>{eventSummary(event)}</small>}
                  </li>
                ))}
              </ol>
            </div>
            {selectedRequest.status === 'New' && <button onClick={handleStartReview}>Start review</button>}
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
      </section>
    </div>
  );
}