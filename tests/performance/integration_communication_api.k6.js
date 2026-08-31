import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = __ENV.EDUGUARD_BASE_URL || 'http://127.0.0.1:8000';

const VUS = Number(__ENV.EDUGUARD_VUS || 3);
const DURATION = __ENV.EDUGUARD_DURATION || '20s';
const P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_P95_MS || 3000);

const RUN_ID = String(
  __ENV.EDUGUARD_RUN_ID || `${Date.now()}${Math.floor(Math.random() * 100000)}`
)
  .replace(/[^a-zA-Z0-9]/g, '')
  .slice(-16);

const PASSWORD = __ENV.EDUGUARD_TEST_PASSWORD || 'Password123!';

export const options = {
  scenarios: {
    integration_communication_smoke: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '30s',
    },
  },
  setupTimeout: '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scope:health}': ['p(95)<1000'],
    'http_req_duration{scope:communication_threads}': [`p(95)<${P95_THRESHOLD_MS}`],
    checks: ['rate>0.95'],
  },
};

const jsonHeaders = {
  headers: {
    'Content-Type': 'application/json',
  },
};

function safeJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

function isArrayJson(res) {
  const data = safeJson(res);
  return Array.isArray(data);
}

function postJson(path, body, expectedStatus, label) {
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    ...jsonHeaders,
    tags: {
      scope: 'setup',
      name: label,
    },
  });

  if (res.status !== expectedStatus) {
    fail(`${label} failed. Expected ${expectedStatus}, got ${res.status}. Body: ${res.body}`);
  }

  return res;
}

export function setup() {
  const health = http.get(`${BASE_URL}/health`, {
    tags: {
      scope: 'health',
      name: 'Health check',
    },
  });

  if (health.status !== 200) {
    fail(
      `Backend is not running at ${BASE_URL}. Start FastAPI first. /health returned ${health.status}.`
    );
  }

  const lecturerIdent = `iclect${RUN_ID}`.toLowerCase();
  const studentIdent = `icstud${RUN_ID}`.toLowerCase();

  postJson(
    '/auth/signup',
    {
      full_name: 'Integration Communication Lecturer',
      username: lecturerIdent,
      email: `${lecturerIdent}@example.com`,
      password: PASSWORD,
      role: 'lecturer',
    },
    200,
    'Create lecturer test user'
  );

  postJson(
    '/auth/signup',
    {
      full_name: 'Integration Communication Student',
      username: studentIdent,
      email: `${studentIdent}@example.com`,
      password: PASSWORD,
      role: 'student',
    },
    200,
    'Create student test user'
  );

  const lecturerThreads = http.get(
    `${BASE_URL}/communications/lecturer/${lecturerIdent}/threads`,
    {
      tags: {
        scope: 'communication_threads',
        name: 'Lecturer threads setup check',
      },
    }
  );

  if (lecturerThreads.status !== 200) {
    fail(
      `Lecturer communication threads endpoint failed. Expected 200, got ${lecturerThreads.status}. Body: ${lecturerThreads.body}`
    );
  }

  const studentThreads = http.get(
    `${BASE_URL}/communications/student/${studentIdent}/threads`,
    {
      tags: {
        scope: 'communication_threads',
        name: 'Student threads setup check',
      },
    }
  );

  if (studentThreads.status !== 200) {
    fail(
      `Student communication threads endpoint failed. Expected 200, got ${studentThreads.status}. Body: ${studentThreads.body}`
    );
  }

  return {
    lecturerIdent,
    studentIdent,
  };
}

export default function (data) {
  const health = http.get(`${BASE_URL}/health`, {
    tags: {
      scope: 'health',
      name: 'Health check',
    },
  });

  check(health, {
    'health responded 200': (r) => r.status === 200,
  });

  const lecturerThreads = http.get(
    `${BASE_URL}/communications/lecturer/${data.lecturerIdent}/threads`,
    {
      tags: {
        scope: 'communication_threads',
        name: 'Lecturer communication threads',
      },
    }
  );

  check(lecturerThreads, {
    'lecturer threads responded 200': (r) => r.status === 200,
    'lecturer threads returned array': (r) => isArrayJson(r),
  });

  const studentThreads = http.get(
    `${BASE_URL}/communications/student/${data.studentIdent}/threads`,
    {
      tags: {
        scope: 'communication_threads',
        name: 'Student communication threads',
      },
    }
  );

  check(studentThreads, {
    'student threads responded 200': (r) => r.status === 200,
    'student threads returned array': (r) => isArrayJson(r),
  });

  sleep(1);
}