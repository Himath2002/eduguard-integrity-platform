import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = __ENV.EDUGUARD_BASE_URL || 'http://127.0.0.1:8000';
const IDENT = __ENV.EDUGUARD_LECTURER_IDENT || 'teach';
const SUBMISSION_ID = String(__ENV.EDUGUARD_FALSE_DETECTION_SUBMISSION_ID || '501');
const AUTH_TOKEN = __ENV.EDUGUARD_BEARER_TOKEN || '';

const VUS = Number(__ENV.EDUGUARD_VUS || 1);
const DURATION = __ENV.EDUGUARD_DURATION || '20s';
const P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_P95_MS || 4000);

export const options = {
  scenarios: {
    false_detection_override_smoke: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '30s',
    },
  },
  setupTimeout: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scope:false_detection_save}': [`p(95)<${P95_THRESHOLD_MS}`],
  },
};

const jsonHeaders = {
  'Content-Type': 'application/json',
};

if (AUTH_TOKEN) {
  jsonHeaders.Authorization = `Bearer ${AUTH_TOKEN}`;
}

function taggedParams(scope, extraHeaders = {}) {
  return {
    headers: {
      ...jsonHeaders,
      ...extraHeaders,
    },
    tags: {
      scope,
    },
  };
}

export function setup() {
  const health = http.get(`${BASE_URL}/health`, {
    tags: {
      scope: 'setup',
    },
  });

  if (health.status !== 200) {
    fail(
      `Backend is not running at ${BASE_URL}. Start FastAPI first. /health returned ${health.status}.`
    );
  }

  const reportTextRes = http.get(
    `${BASE_URL}/lecturer/${IDENT}/submissions/${SUBMISSION_ID}/report-text`,
    taggedParams('setup')
  );

  if (reportTextRes.status !== 200) {
    fail(
      `False-detection fixture is not ready. Expected report-text 200, got ${reportTextRes.status}. ` +
        `Run: python tests/test-data/seed_false_detection_fixture.py. Body: ${reportTextRes.body}`
    );
  }

  const report = reportTextRes.json();
  const originalPercent = Number(report.original_plagiarism_percent || 60);

  return {
    originalPercent,
  };
}

export default function (data) {
  /*
    This is a local performance smoke test for the false-detection save endpoint.

    It intentionally uses 1 VU by default because false-detection review has
    lock/idempotency protection. Concurrent saves against the same submission
    can correctly trigger lock conflicts, which should not be counted as
    performance failures for this single-report smoke test.

    To override:
    $env:EDUGUARD_VUS="1"
    $env:EDUGUARD_P95_MS="4000"
  */

  const idempotencyKey = `k6-false-detection-${Date.now()}-${__VU}-${__ITER}`;

  const body = JSON.stringify({
    removed_ranges: [],
    adjusted_plagiarism_percent: Number(data.originalPercent),
    justification_note: 'Performance smoke save for false-detection review endpoint.',
  });

  const res = http.put(
    `${BASE_URL}/lecturer/${IDENT}/submissions/${SUBMISSION_ID}/false-detection-review`,
    body,
    taggedParams('false_detection_save', {
      'Idempotency-Key': idempotencyKey,
    })
  );

  check(res, {
    'override responded 200': (r) => r.status === 200,
    'override returned ok': (r) => r.json('ok') === true,
    'override returned version': (r) => Number(r.json('version_no')) >= 1,
    'override returned adjusted percent': (r) =>
      Number(r.json('adjusted_plagiarism_percent')) >= 0,
  });

  sleep(1);
}