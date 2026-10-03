#!/usr/bin/env python3
"""Classify genuine Claude results without printing provider text or secrets."""
import json
import os
import re
import sys
from pathlib import Path

LIMIT = re.compile(r"^You['’]ve hit your (?:weekly |session |usage )?limit(?:[ ·:—-]|$)", re.I)
# A startup failure that never reached the model with one of these exact account messages means THIS account
# cannot be used right now (out of room, or its key was rejected); the next account is tried. Anything else
# stays a failure (2026-10-03, Codex fold; phrases kept exact so "size limit" or a GitHub 401 never rotate).
NEXT_ACCOUNT = re.compile(r"hit your (?:weekly |session |usage )?limit|usage limit|rate_limit_error|rate limit(?:ed| reached| exceeded)"
                          r"|invalid (?:api key|oauth|bearer)|oauth (?:access )?token (?:is invalid|has expired)"
                          r"|authentication_error|failed to authenticate|please run /login", re.I)

def tokens(result):
    usage = result.get('usage') or {}
    total = sum(v for k, v in usage.items()
                if k in ('input_tokens', 'output_tokens', 'cache_read_input_tokens',
                         'cache_creation_input_tokens') and isinstance(v, (int, float)))
    models = result.get('modelUsage') or {}
    if isinstance(models, dict):
        total += sum(v for usage in models.values() if isinstance(usage, dict)
                     for k, v in usage.items()
                     if k in ('inputTokens', 'outputTokens', 'cacheReadInputTokens',
                              'cacheCreationInputTokens') and isinstance(v, (int, float)))
    return total

def classify(messages, outcome):
    if not isinstance(messages, list):
        return 'failed'
    results = [m for m in messages if isinstance(m, dict) and m.get('type') == 'result']
    if len(results) != 1:
        return 'failed'
    r = results[0]
    if (outcome == 'success' and r.get('is_error') is False
            and r.get('subtype') == 'success' and r.get('num_turns', 0) > 0
            and r.get('duration_ms', 0) > 0 and tokens(r) > 0):
        return 'complete'
    # Only a startup failure that spent nothing (a usage limit or a rejected key) permits another credential.
    if (outcome == 'failure' and r.get('is_error') is True and tokens(r) == 0
            and (r.get('num_turns') or 0) <= 1 and not r.get('total_cost_usd')
            and isinstance(r.get('result'), str)
            and (LIMIT.match(r['result']) or NEXT_ACCOUNT.search(r['result']))):
        return 'quota'
    return 'failed'

def failure_reason(messages):
    """Return only an allowlisted label; provider text can contain secrets."""
    if not isinstance(messages, list):
        return 'invalid execution record'
    failures = [m for m in messages if isinstance(m, dict) and m.get('type') == 'result'
                and m.get('is_error') is True and not m.get('modelUsage')]
    text = ' '.join(str(m.get('result', '')) for m in failures).lower()
    labels = {
        'credential rejected or expired': ('invalid api key', 'invalid oauth', 'invalid bearer',
            'authentication_error', 'authentication failed', 'oauth token has expired',
            'please run /login', 'unauthorized', 'invalid token',
            'failed to authenticate', 'oauth access token is invalid'),
        'account usage or rate limit': ('limit', 'rate_limit_error', 'usage restriction'),
        'account billing unavailable': ('credit balance', 'billing', 'payment required'),
        'model unavailable': ('model_not_found', 'model not found', 'access to model'),
        'provider unavailable': ('overloaded', 'service unavailable', 'internal_server_error'),
    }
    return next((label for label, terms in labels.items() if any(t in text for t in terms)),
                'unclassified failure; no fallback permitted')

def startup_detail(messages):
    if not isinstance(messages, list):
        return ''
    for m in messages:
        if not (isinstance(m, dict) and m.get('type') == 'result'
                and m.get('is_error') is True and not m.get('modelUsage')):
            continue
        detail = str(m.get('result') or m.get('errors') or 'No startup detail supplied.')
        detail = re.sub(r'https?://\S+', '[URL]', detail)
        detail = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[EMAIL]', detail)
        detail = re.sub(r'(?i)bearer\s+\S+', 'Bearer [REDACTED]', detail)
        detail = re.sub(r'[A-Za-z0-9_./+=-]{24,}', '[REDACTED]', detail)
        return detail[:600]
    return ''

def main():
    record = Path(os.environ['RUNNER_TEMP']) / 'claude-execution-output.json'
    if sys.argv[1] == 'prepare':
        record.unlink(missing_ok=True)
        return
    if os.environ.get('CONFIGURED') != 'true':
        state = 'quota'  # Empty optional slot: search the next configured account.
        print('Claude account slot is not configured.')
    else:
        try:
            messages = json.loads(record.read_text())
            state = classify(messages, os.environ.get('OUTCOME'))
            if state == 'quota':
                print('Claude account not usable now (' + failure_reason(messages)
                      + '); trying the next account. Renew this slot with review-robot-fix if it repeats.')
            if state == 'failed':
                reason = failure_reason(messages)
                print('Claude failure category: ' + reason)
                if reason.startswith('unclassified'):
                    print('Claude startup detail (redacted): ' + startup_detail(messages))
        except (OSError, ValueError, TypeError, AttributeError):
            state = 'failed'
        print('Claude review result: ' + state)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        out.write('state=' + state + '\n')
    if state == 'failed':
        raise SystemExit('Review did not complete; account fallback is not permitted.')

if __name__ == '__main__':
    main()
