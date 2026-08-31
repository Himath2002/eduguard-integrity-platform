import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = __ENV.EDUGUARD_BASE_URL || 'http://127.0.0.1:8000';

const VUS = Number(__ENV.EDUGUARD_VUS || 5);
const DURATION = __ENV.EDUGUARD_DURATION || '30s';

/*
  Local development machines can be slower because the backend,
  frontend, database, and test runner may all run on the same laptop.

  The default 3000ms threshold is intentionally conservative for a local
  smoke environment. Tighten it through EDUGUARD_P95_MS for a dedicated
  performance environment.
*/
const P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_P95_MS || 3000);

export const options = {
  scenarios: {
    presign_smoke: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '30s',
    },
  },
  setupTimeout: '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'],

    /*
      Apply latency threshold only to the actual presign smoke requests.
      Setup requests are excluded because user/class/assignment creation
      can be slower and should not affect the upload-presign performance result.
    */
    'http_req_duration{scope:presign}': [`p(95)<${P95_THRESHOLD_MS}`],
  },
};

const RUN_ID = String(
  __ENV.EDUGUARD_RUN_ID || `${Date.now()}${Math.floor(Math.random() * 100000)}`
)
  .replace(/[^a-zA-Z0-9]/g, '')
  .slice(-16);

const PASSWORD = __ENV.EDUGUARD_TEST_PASSWORD || 'Password123!';

const jsonHeaders = {
  headers: {
    'Content-Type': 'application/json',
  },
};

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

function requireJsonField(json, field, label) {
  const value = json && json[field];

  if (value === undefined || value === null || value === '') {
    fail(`${label} did not return required field: ${field}. Body: ${JSON.stringify(json)}`);
  }

  return value;
}

export function setup() {
  const health = http.get(`${BASE_URL}/health`, {
    tags: {
      scope: 'setup',
      name: 'Health check',
    },
  });

  if (health.status !== 200) {
    fail(`Backend is not running at ${BASE_URL}. /health returned ${health.status}. Start FastAPI first.`);
  }

  const lecturerIdent = `k6lect${RUN_ID}`.toLowerCase();
  const studentIdent = `k6stud${RUN_ID}`.toLowerCase();
  const classCode = `K6DM${RUN_ID}`.toUpperCase();

  postJson(
    '/auth/signup',
    {
      full_name: 'K6 Lecturer',
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
      full_name: 'K6 Student',
      username: studentIdent,
      email: `${studentIdent}@example.com`,
      password: PASSWORD,
      role: 'student',
    },
    200,
    'Create student test user'
  );

  const classRes = postJson(
    `/lecturer/${lecturerIdent}/classes`,
    {
      name: `K6 Document Management ${RUN_ID}`,
      code: classCode,
      description: 'Temporary class created by k6 document-management performance smoke test.',
    },
    200,
    'Create test class'
  );

  const classId = Number(requireJsonField(classRes.json(), 'id', 'Create class'));

  postJson(
    `/student/${studentIdent}/classes/join`,
    {
      classCode,
    },
    200,
    'Join test class'
  );

  const assignmentRes = postJson(
    `/lecturer/${lecturerIdent}/assignments`,
    {
      class_id: classId,
      title: `K6 Upload Assignment ${RUN_ID}`,
      description: 'Temporary assignment created by k6 document-management performance smoke test.',
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      allow_resubmission: true,
      max_attempts: 50,
      student_report_visible: false,
    },
    200,
    'Create test assignment'
  );

  const assignmentId = Number(requireJsonField(assignmentRes.json(), 'id', 'Create assignment'));

  return {
    studentIdent,
    classId,
    assignmentId,
  };
}

export default function (data) {
  const payload = JSON.stringify({
    class_id: data.classId,
    assignment_id: data.assignmentId,
    filename: 'essay-1.pdf',
    content_type: 'application/pdf',
  });

  const res = http.post(
    `${BASE_URL}/student/${data.studentIdent}/submissions/presign`,
    payload,
    {
      ...jsonHeaders,
      tags: {
        scope: 'presign',
        name: 'Presign PDF upload',
      },
    }
  );

  check(res, {
    'presign responded 200': (r) => r.status === 200,
    'presign returned bucket': (r) => Boolean(r.json('bucket')),
    'presign returned key': (r) => Boolean(r.json('key')),
    'presign returned upload url': (r) => {
      const upload = r.json('upload');
      return Boolean(upload && upload.url);
    },
  });

  sleep(1);
}
