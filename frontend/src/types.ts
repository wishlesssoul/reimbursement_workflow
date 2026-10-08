export type UserRole = 'Customer' | 'Reviewer' | 'Admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: number;
  created_at: string;
}

export interface RequestRecord {
  id: string;
  request_reference?: string;
  customer_reference?: string;
  customer_id?: string;
  expense_date?: string;
  amount_inr?: number;
  description?: string;
  status?: string;
  version?: number;
  latest_review_explanation?: string | null;
  created_at?: string;
  updated_at?: string;
  decisions?: ReviewDecision[];
  events?: RequestEvent[];
}

export interface ReviewDecision {
  id: string;
  decision_type: string;
  explanation?: string | null;
  reviewer_id: string;
  created_at: string;
}

export interface RequestEvent {
  id: string;
  event_type: string;
  actor_type: string;
  metadata?: string | null;
  created_at: string;
}

export interface ReviewAdvisoryResponse {
  engine: string;
  generatedAt: string;
  notice: string;
  advisory: {
    summary: string;
    observations: string[];
    questions: string[];
  };
  possibleDuplicates: Array<{
    requestReference: string;
    status: string;
    reason: string;
  }>;
}
