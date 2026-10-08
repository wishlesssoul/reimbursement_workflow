import json
import re
import sys
from difflib import SequenceMatcher
from math import isclose


GENERIC_DESCRIPTIONS = {'travel', 'supplies', 'expense', 'miscellaneous', 'other'}


def normalized_text(value):
    return ' '.join(re.findall(r'[a-z0-9]+', str(value or '').lower()))


def check_completeness(request):
    questions = []
    required_fields = {
        'customer reference': request.get('customerReference'),
        'expense date': request.get('expenseDate'),
        'amount': request.get('amountInr'),
        'description': request.get('description'),
    }
    missing = [label for label, value in required_fields.items() if value in (None, '')]
    if missing:
        questions.append(f"Confirm the missing {', '.join(missing)}.")

    description = normalized_text(request.get('description'))
    if len(description) < 24 or description in GENERIC_DESCRIPTIONS:
        questions.append('Can the customer provide a clearer business purpose and supporting context?')

    return questions


def compare_possible_duplicates(request, candidates):
    request_description = normalized_text(request.get('description'))
    request_amount = request.get('amountInr')
    matches = []

    for candidate in candidates:
        same_date = candidate.get('expense_date') == request.get('expenseDate')
        try:
            same_amount = isclose(float(candidate.get('amount_inr')), float(request_amount), rel_tol=1e-6, abs_tol=0.01)
        except (TypeError, ValueError):
            same_amount = False
        candidate_description = normalized_text(candidate.get('description'))
        description_similarity = SequenceMatcher(None, request_description, candidate_description).ratio()

        if same_date and same_amount:
            reason = 'Same customer reference, expense date, and amount.'
        elif description_similarity >= 0.85 and same_amount:
            reason = 'Same customer reference and amount with a similar description.'
        else:
            continue

        matches.append({
            'requestReference': candidate.get('request_reference'),
            'status': candidate.get('status'),
            'reason': reason,
        })

    return matches[:5]


def build_advisory(context):
    request = context.get('request') or {}
    history = context.get('history') or []
    prior_decisions = context.get('priorDecisions') or []
    candidates = context.get('candidates') or []
    reference = request.get('reference') or 'Request'
    status = request.get('status') or 'unknown status'

    observations = [f'Request status is {status}.']
    observations.append(f'{len(history)} workflow event(s) and {len(prior_decisions)} prior decision(s) are recorded.')
    if not candidates:
        observations.append('No same-customer requests were available for comparison.')

    possible_duplicates = compare_possible_duplicates(request, candidates)
    questions = check_completeness(request)
    if status in {'MoreInformationRequested', 'AwaitingCustomerResponse'}:
        questions.append('Has the requested customer information arrived and been verified?')
    for duplicate in possible_duplicates:
        questions.append(f"Is {duplicate['requestReference']} a duplicate of this request? {duplicate['reason']}")
    if not questions:
        questions.append('Verify the submitted details and supporting documents against the source records.')

    amount = request.get('amountInr')
    amount_text = f'INR {amount:,.2f}' if isinstance(amount, (int, float)) else 'an unspecified amount'
    date = request.get('expenseDate') or 'an unspecified date'
    summary = f'{reference} is in {status} for {amount_text}, dated {date}.'
    if possible_duplicates:
        summary += f' {len(possible_duplicates)} possible duplicate match(es) need review.'

    return {
        'engine': 'python-rules-v1',
        'advisory': {
            'summary': summary,
            'observations': observations,
            'questions': questions,
        },
        'possibleDuplicates': possible_duplicates,
    }


def main():
    context = json.load(sys.stdin)
    print(json.dumps(build_advisory(context)))


if __name__ == '__main__':
    main()