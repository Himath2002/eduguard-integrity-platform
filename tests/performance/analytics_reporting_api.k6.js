import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = __ENV.EDUGUARD_BASE_URL || 'http://127.0.0.1:8000';

const VUS = Number(__ENV.EDUGUARD_VUS || 3);
const DURATION = __ENV.EDUGUARD_DURATION || '20s';
const P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_P95_MS || 3000);
const DETAIL_P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_DETAIL_P95_MS || 4000);

const PASSWORD = __ENV.EDUGUARD_TEST_PASSWORD || 'Password123!';

const ADMIN_REPORT_PAGE_SIZE = Number(__ENV.EDUGUARD_ADMIN_REPORT_PAGE_SIZE || 32);
const LECTURER_REPORT_PAGE_SIZE = Number(__ENV.EDUGUARD_LECTURER_REPORT_PAGE_SIZE || 24);
const STUDENT_REPORT_PAGE_SIZE = Number(__ENV.EDUGUARD_STUDENT_REPORT_PAGE_SIZE || 20);

const RUN_ID = String(
  __ENV.EDUGUARD_RUN_ID || `${Date.now()}${Math.floor(Math.random() * 100000)}`
)
  .replace(/[^a-zA-Z0-9]/g, '')
  .slice(-16);

/*
  Optional existing fixture mode.

  Use these only if you already have seeded submissions with integrity/marked reports:

  EDUGUARD_LECTURER_IDENT=teach
  EDUGUARD_STUDENT_IDENT=student1
  EDUGUARD_CLASS_CODE=FIT101
  EDUGUARD_ADMIN_REPORT_SUBMISSION_ID=9001
  EDUGUARD_LECTURER_REPORT_SUBMISSION_ID=7001
  EDUGUARD_STUDENT_REPORT_SUBMISSION_ID=6001
  EDUGUARD_STUDENT_MARKED_SUBMISSION_ID=6001

  Without those IDs, this script still tests analytics/reporting list endpoints.
*/

const EXISTING_LECTURER_IDENT = __ENV.EDUGUARD_LECTURER_IDENT || '';
const EXISTING_STUDENT_IDENT = __ENV.EDUGUARD_STUDENT_IDENT || '';
const EXISTING_CLASS_CODE = __ENV.EDUGUARD_CLASS_CODE || '';

const ADMIN_REPORT_SUBMISSION_ID = __ENV.EDUGUARD_ADMIN_REPORT_SUBMISSION_ID || '';
const LECTURER_REPORT_SUBMISSION_ID = __ENV.EDUGUARD_LECTURER_REPORT_SUBMISSION_ID || '';
const STUDENT_REPORT_SUBMISSION_ID = __ENV.EDUGUARD_STUDENT_REPORT_SUBMISSION_ID || '';
const STUDENT_MARKED_SUBMISSION_ID = __ENV.EDUGUARD_STUDENT_MARKED_SUBMISSION_ID || '';

export const options = {
  scenarios: {
    analytics_reporting_smoke: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '30s',
    },
  },
  setupTimeout: '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.95'],

    'http_req_duration{scope:health}': ['p(95)<1000'],
    'http_req_duration{scope:analytics_summary}': [`p(95)<${P95_THRESHOLD_MS}`],
    'http_req_duration{scope:reporting_list}': [`p(95)<${P95_THRESHOLD_MS}`],
    'http_req_duration{scope:reporting_detail}': [`p(95)<${DETAIL_P95_THRESHOLD_MS}`],
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

function isObjectJson(res) {
  const data = safeJson(res);
  return Boolean(data && typeof data === 'object' && !Array.isArray(data));
}

function isArrayJson(res) {
  const data = safeJson(res);
  return Array.isArray(data);
}

function hasNumericField(res, field) {
  const data = safeJson(res);
  return Boolean(data && Number.isFinite(Number(data[field])));
}

function withClassCode(path, classCode) {
  if (!classCode) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}class_code=${encodeURIComponent(classCode)}`;
}

function withPage(path, limit) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}limit=${limit}&offset=0`;
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

function requireJsonField(json, field, label) {
  const value = json && json[field];

  if (value === undefined || value === null || value === '') {
    fail(`${label} did not return required field: ${field}. Body: ${JSON.stringify(json)}`);
  }

  return value;
}

function checkHealth() {
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
}

function checkExistingUsers(lecturerIdent, studentIdent) {
  const lecturerSummary = http.get(`${BASE_URL}/lecturer/${lecturerIdent}/dashboard/summary`, {
    tags: {
      scope: 'setup',
      name: 'Existing lecturer dashboard check',
    },
  });

  if (lecturerSummary.status !== 200) {
    fail(
      `Existing lecturer identity is not valid. ` +
        `GET /lecturer/${lecturerIdent}/dashboard/summary returned ${lecturerSummary.status}. ` +
        `Body: ${lecturerSummary.body}`
    );
  }

  const studentSummary = http.get(`${BASE_URL}/student/${studentIdent}/dashboard/summary`, {
    tags: {
      scope: 'setup',
      name: 'Existing student dashboard check',
    },
  });

  if (studentSummary.status !== 200) {
    fail(
      `Existing student identity is not valid. ` +
        `GET /student/${studentIdent}/dashboard/summary returned ${studentSummary.status}. ` +
        `Body: ${studentSummary.body}`
    );
  }
}

export function setup() {
  checkHealth();

  if (EXISTING_LECTURER_IDENT && EXISTING_STUDENT_IDENT) {
    checkExistingUsers(EXISTING_LECTURER_IDENT, EXISTING_STUDENT_IDENT);

    return {
      lecturerIdent: EXISTING_LECTURER_IDENT,
      studentIdent: EXISTING_STUDENT_IDENT,
      classCode: EXISTING_CLASS_CODE,
      adminReportSubmissionId: ADMIN_REPORT_SUBMISSION_ID,
      lecturerReportSubmissionId: LECTURER_REPORT_SUBMISSION_ID,
      studentReportSubmissionId: STUDENT_REPORT_SUBMISSION_ID,
      studentMarkedSubmissionId: STUDENT_MARKED_SUBMISSION_ID,
    };
  }

  const lecturerIdent = `arlect${RUN_ID}`.toLowerCase();
  const studentIdent = `arstud${RUN_ID}`.toLowerCase();
  const classCode = `K6AR${RUN_ID}`.toUpperCase();

  postJson(
    '/auth/signup',
    {
      full_name: 'K6 Analytics Lecturer',
      username: lecturerIdent,
      email: `${lecturerIdent}@example.com`,
      password: PASSWORD,
      role: 'lecturer',
    },
    200,
    'Create analytics lecturer test user'
  );

  postJson(
    '/auth/signup',
    {
      full_name: 'K6 Analytics Student',
      username: studentIdent,
      email: `${studentIdent}@example.com`,
      password: PASSWORD,
      role: 'student',
    },
    200,
    'Create analytics student test user'
  );

  const classRes = postJson(
    `/lecturer/${lecturerIdent}/classes`,
    {
      name: `K6 Analytics Reporting ${RUN_ID}`,
      code: classCode,
      description: 'Temporary class created by k6 analytics/reporting performance smoke test.',
    },
    200,
    'Create analytics reporting test class'
  );

  const classId = Number(requireJsonField(classRes.json(), 'id', 'Create analytics reporting class'));

  postJson(
    `/student/${studentIdent}/classes/join`,
    {
      classCode,
    },
    200,
    'Join analytics reporting test class'
  );

  postJson(
    `/lecturer/${lecturerIdent}/assignments`,
    {
      class_id: classId,
      title: `K6 Analytics Assignment ${RUN_ID}`,
      description: 'Temporary assignment created by k6 analytics/reporting performance smoke test.',
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      allow_resubmission: true,
      max_attempts: 10,
      student_report_visible: true,
    },
    200,
    'Create analytics reporting test assignment'
  );

  return {
    lecturerIdent,
    studentIdent,
    classCode,
    adminReportSubmissionId: ADMIN_REPORT_SUBMISSION_ID,
    lecturerReportSubmissionId: LECTURER_REPORT_SUBMISSION_ID,
    studentReportSubmissionId: STUDENT_REPORT_SUBMISSION_ID,
    studentMarkedSubmissionId: STUDENT_MARKED_SUBMISSION_ID,
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

  const adminDashboardSummary = http.get(`${BASE_URL}/admin/dashboard/summary`, {
    tags: {
      scope: 'analytics_summary',
      name: 'Admin analytics dashboard summary',
    },
  });

  check(adminDashboardSummary, {
    'admin dashboard summary responded 200': (r) => r.status === 200,
    'admin dashboard summary has instructors count': (r) => hasNumericField(r, 'instructors'),
    'admin dashboard summary has students count': (r) => hasNumericField(r, 'students'),
    'admin dashboard summary has pending submissions count': (r) =>
      hasNumericField(r, 'pending_submissions'),
  });

  const lecturerDashboardSummary = http.get(
    `${BASE_URL}/lecturer/${data.lecturerIdent}/dashboard/summary`,
    {
      tags: {
        scope: 'analytics_summary',
        name: 'Lecturer analytics dashboard summary',
      },
    }
  );

  check(lecturerDashboardSummary, {
    'lecturer dashboard summary responded 200': (r) => r.status === 200,
    'lecturer dashboard summary returned object': (r) => isObjectJson(r),
  });

  const studentDashboardSummary = http.get(
    `${BASE_URL}/student/${data.studentIdent}/dashboard/summary`,
    {
      tags: {
        scope: 'analytics_summary',
        name: 'Student analytics dashboard summary',
      },
    }
  );

  check(studentDashboardSummary, {
    'student dashboard summary responded 200': (r) => r.status === 200,
    'student dashboard summary returned object': (r) => isObjectJson(r),
  });

  const adminReports = http.get(
    `${BASE_URL}${withClassCode(withPage('/admin/reports', ADMIN_REPORT_PAGE_SIZE), data.classCode)}`,
    {
      tags: {
        scope: 'reporting_list',
        name: 'Admin institution reports list',
      },
    }
  );

  check(adminReports, {
    'admin reports responded 200': (r) => r.status === 200,
    'admin reports returned array': (r) => isArrayJson(r),
  });

  const lecturerReports = http.get(
    `${BASE_URL}${withClassCode(
      withPage(`/lecturer/${data.lecturerIdent}/reports`, LECTURER_REPORT_PAGE_SIZE),
      data.classCode
    )}`,
    {
      tags: {
        scope: 'reporting_list',
        name: 'Lecturer reports list',
      },
    }
  );

  check(lecturerReports, {
    'lecturer reports responded 200': (r) => r.status === 200,
    'lecturer reports returned array': (r) => isArrayJson(r),
  });

  const studentIntegrityReports = http.get(
    `${BASE_URL}${withClassCode(
      withPage(`/student/${data.studentIdent}/reports`, STUDENT_REPORT_PAGE_SIZE),
      data.classCode
    )}`,
    {
      tags: {
        scope: 'reporting_list',
        name: 'Student integrity reports list',
      },
    }
  );

  check(studentIntegrityReports, {
    'student integrity reports responded 200': (r) => r.status === 200,
    'student integrity reports returned array': (r) => isArrayJson(r),
  });

  const studentMarkedReports = http.get(
    `${BASE_URL}${withClassCode(
      withPage(`/student/${data.studentIdent}/marked-reports`, STUDENT_REPORT_PAGE_SIZE),
      data.classCode
    )}`,
    {
      tags: {
        scope: 'reporting_list',
        name: 'Student marked reports list',
      },
    }
  );

  check(studentMarkedReports, {
    'student marked reports responded 200': (r) => r.status === 200,
    'student marked reports returned array': (r) => isArrayJson(r),
  });

  if (data.adminReportSubmissionId) {
    const adminReportText = http.get(
      `${BASE_URL}/admin/submissions/${data.adminReportSubmissionId}/report-text`,
      {
        tags: {
          scope: 'reporting_detail',
          name: 'Admin report text detail',
        },
      }
    );

    check(adminReportText, {
      'admin report text responded 200': (r) => r.status === 200,
      'admin report text returned object': (r) => isObjectJson(r),
    });
  }

  if (data.lecturerReportSubmissionId) {
    const lecturerReportText = http.get(
      `${BASE_URL}/lecturer/${data.lecturerIdent}/submissions/${data.lecturerReportSubmissionId}/report-text`,
      {
        tags: {
          scope: 'reporting_detail',
          name: 'Lecturer report text detail',
        },
      }
    );

    check(lecturerReportText, {
      'lecturer report text responded 200': (r) => r.status === 200,
      'lecturer report text returned object': (r) => isObjectJson(r),
    });
  }

  if (data.studentReportSubmissionId) {
    const studentReportText = http.get(
      `${BASE_URL}/student/${data.studentIdent}/submissions/${data.studentReportSubmissionId}/report-text`,
      {
        tags: {
          scope: 'reporting_detail',
          name: 'Student integrity report text detail',
        },
      }
    );

    check(studentReportText, {
      'student report text responded 200': (r) => r.status === 200,
      'student report text returned object': (r) => isObjectJson(r),
    });
  }

  if (data.studentMarkedSubmissionId) {
    const studentMarkedReportDetail = http.get(
      `${BASE_URL}/student/${data.studentIdent}/submissions/${data.studentMarkedSubmissionId}/marked-report`,
      {
        tags: {
          scope: 'reporting_detail',
          name: 'Student marked report detail',
        },
      }
    );

    check(studentMarkedReportDetail, {
      'student marked report detail responded 200': (r) => r.status === 200,
      'student marked report detail returned object': (r) => isObjectJson(r),
    });
  }

  sleep(1);
}
