import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('claude-review-result.py'))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)

class ReviewResultTests(unittest.TestCase):
    def result(self, **changes):
        record = dict(type='result', subtype='success', is_error=False,
                      num_turns=1, duration_ms=1000,
                      usage={'input_tokens': 10, 'output_tokens': 10},
                      modelUsage={}, result='Review completed.')
        record.update(changes)
        return record

    def test_real_review_completes(self):
        self.assertEqual(review.classify([self.result()], 'success'), 'complete')

    def test_observed_weekly_limit_allows_fallback(self):
        for text in ("You've hit your weekly limit · resets Oct 6, 10pm (UTC)",
                     "You’ve hit your weekly limit · resets Oct 6, 3pm (America/Los_Angeles)"):
            with self.subTest(text=text):
                r = self.result(is_error=True, usage={}, result=text)
                self.assertEqual(review.classify([r], 'failure'), 'quota')

    def test_rejected_key_and_rate_limit_try_next_account(self):
        for text in ('Invalid OAuth token', 'rate_limit_error',
                     'Failed to authenticate. API Error: 401 OAuth access token is invalid.'):
            with self.subTest(text=text):
                r = self.result(is_error=True, usage={}, result=text)
                self.assertEqual(review.classify([r], 'failure'), 'quota')

    def test_spent_attempts_never_rotate(self):
        for changes in (dict(num_turns=12, usage=None), dict(total_cost_usd=0.42, usage={})):
            with self.subTest(changes=changes):
                r = self.result(is_error=True, result="You've hit your weekly limit", **changes)
                self.assertEqual(review.classify([r], 'failure'), 'failed')

    def test_other_errors_and_findings_do_not_rotate(self):
        for text in ('Network error', 'Credit balance too low', 'Something unexpected',
                     'Request size limit exceeded', 'unlimited retries failed', 'GitHub API 401 Unauthorized'):
            with self.subTest(text=text):
                r = self.result(is_error=True, usage={}, result=text)
                self.assertEqual(review.classify([r], 'failure'), 'failed')
        r = self.result(result="P1: Incorrect handling of You've hit your weekly limit")
        self.assertEqual(review.classify([r], 'success'), 'complete')

    def test_limit_after_partial_review_stops(self):
        r = self.result(is_error=True, result="You've hit your weekly limit · resets tomorrow")
        self.assertEqual(review.classify([r], 'failure'), 'failed')

    def test_empty_skip_and_zero_usage_never_pass(self):
        for outcome in ('success', 'failure', 'skipped'):
            for records in ([], {}, [self.result(usage={})], [self.result(num_turns=0)],
                            [self.result(duration_ms=0)], [self.result(), self.result()]):
                with self.subTest(outcome=outcome, records=records):
                    self.assertEqual(review.classify(records, outcome), 'failed')

    def test_action_failure_overrides_apparently_successful_result(self):
        self.assertEqual(review.classify([self.result()], 'failure'), 'failed')

    def test_diagnostic_does_not_print_provider_text_or_tokens(self):
        for text in ('Invalid API key: private-token', 'OAuth token has expired: private-token',
                     'private-token', 'Your account has a usage limit: private-token'):
            r = self.result(is_error=True, usage={}, result=text)
            self.assertNotIn('private-token', review.failure_reason([r]))
        r = self.result(is_error=True, usage={}, result='Invalid API key · Please run /login')
        self.assertEqual(review.failure_reason([r]), 'credential rejected or expired')
        r = self.result(is_error=True, usage={}, result='Failed to authenticate. API Error: 401 OAuth access token is invalid.')
        self.assertEqual(review.failure_reason([r]), 'credential rejected or expired')
        self.assertEqual(review.classify([r], 'failure'), 'quota')

    def test_startup_detail_masks_keys_urls_and_emails(self):
        r = self.result(is_error=True, usage={}, result='API Error: sk-ant-oat01-' + 'x' * 50
                        + ' https://example.com/private test@example.com Bearer short')
        detail = review.startup_detail([r])
        for private in ('sk-ant', 'x' * 50, 'example.com', 'short'):
            self.assertNotIn(private, detail)
        self.assertEqual(review.startup_detail([self.result()]), '')
        self.assertEqual(review.startup_detail([self.result(is_error=True,
                         modelUsage={'model': {'inputTokens': 20}})]), '')

    def test_missing_malformed_and_stale_records_fail_closed(self):
        script = str(Path(__file__).with_name('claude-review-result.py'))
        with tempfile.TemporaryDirectory() as directory:
            record = Path(directory) / 'claude-execution-output.json'
            output = Path(directory) / 'output'
            env = dict(os.environ, RUNNER_TEMP=directory, GITHUB_OUTPUT=str(output),
                       CONFIGURED='true', OUTCOME='success')
            for data in (None, 'not JSON', '[{"type":"system"}]'):
                if data is not None:
                    record.write_text(data)
                result = subprocess.run(['python3', '-B', script, 'check'], env=env, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output.read_text().splitlines()[-1], 'state=failed')
            record.write_text('stale record')
            subprocess.run(['python3', '-B', script, 'prepare'], env=env, check=True)
            self.assertFalse(record.exists())

    def test_rejected_key_moves_on_without_printing_it(self):
        script = str(Path(__file__).with_name('claude-review-result.py'))
        with tempfile.TemporaryDirectory() as directory:
            record = Path(directory) / 'claude-execution-output.json'
            output = Path(directory) / 'output'
            record.write_text('[{"type":"result","subtype":"success","is_error":true,"num_turns":1,'
                              '"duration_ms":500,"usage":{},"modelUsage":{},'
                              '"result":"Failed to authenticate. API Error: 401 OAuth access token is invalid. sk-ant-oat01-private"}]')
            env = dict(os.environ, RUNNER_TEMP=directory, GITHUB_OUTPUT=str(output),
                       CONFIGURED='true', OUTCOME='failure')
            result = subprocess.run(['python3', '-B', script, 'check'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(output.read_text().splitlines()[-1], 'state=quota')
            self.assertIn('credential rejected or expired', result.stdout)
            self.assertNotIn('sk-ant', result.stdout + result.stderr)

if __name__ == '__main__':
    unittest.main()
