import http from "k6/http";
import { check, fail, sleep } from "k6";

const BASE_URL = __ENV.EDUGUARD_BASE_URL || "http://127.0.0.1:8000";

const VUS = Number(__ENV.EDUGUARD_VUS || 2);
const DURATION = __ENV.EDUGUARD_DURATION || "15s";

const LIST_P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_LIST_P95_MS || 2500);
const DETAIL_P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_DETAIL_P95_MS || 4000);
const ANNOUNCEMENT_P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_ANNOUNCEMENT_P95_MS || 2500);
const MESSAGE_P95_THRESHOLD_MS = Number(__ENV.EDUGUARD_MESSAGE_P95_MS || 4000);

const PASSWORD = __ENV.EDUGUARD_TEST_PASSWORD || "Password123!";

const RUN_ID = String(
  __ENV.EDUGUARD_RUN_ID || `${Date.now()}${Math.floor(Math.random() * 100000)}`
)
  .replace(/[^a-zA-Z0-9]/g, "")
  .slice(-16);

/*
Optional existing fixture mode.

Use these when you already have a real feedback/collaboration thread created from
a marked annotation in your system:

EDUGUARD_LECTURER_IDENT=teach
EDUGUARD_STUDENT_IDENT=student1
EDUGUARD_ADMIN_IDENT=admin1
EDUGUARD_CLASS_CODE=FIT101
EDUGUARD_THREAD_ID=10
EDUGUARD_ENABLE_MESSAGE_POST=1

Notes:
- Without EDUGUARD_THREAD_ID, this script still performs a valid smoke test for:
  - /health
  - lecturer thread list
  - student thread list
  - admin announcement create/list/search
- Thread detail and message post are only exercised when EDUGUARD_THREAD_ID is provided.
*/

const EXISTING_LECTURER_IDENT = __ENV.EDUGUARD_LECTURER_IDENT || "";
const EXISTING_STUDENT_IDENT = __ENV.EDUGUARD_STUDENT_IDENT || "";
const EXISTING_ADMIN_IDENT = __ENV.EDUGUARD_ADMIN_IDENT || "";
const EXISTING_CLASS_CODE = __ENV.EDUGUARD_CLASS_CODE || "";
const EXISTING_THREAD_ID = __ENV.EDUGUARD_THREAD_ID || "";

const ENABLE_MESSAGE_POST =
  String(__ENV.EDUGUARD_ENABLE_MESSAGE_POST || "0").toLowerCase() === "1" ||
  String(__ENV.EDUGUARD_ENABLE_MESSAGE_POST || "0").toLowerCase() === "true";

export const options = {
  scenarios: {
    feedback_collaboration_smoke: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      gracefulStop: "20s",
    },
  },
  setupTimeout: "60s",
  thresholds: {
    http_req_failed: ["rate<0.02"],
    checks: ["rate>0.95"],

    "http_req_duration{scope:health}": ["p(95)<1000"],
    "http_req_duration{scope:communication_list}": [`p(95)<${LIST_P95_THRESHOLD_MS}`],
    "http_req_duration{scope:communication_detail}": [`p(95)<${DETAIL_P95_THRESHOLD_MS}`],
    "http_req_duration{scope:announcement_list}": [`p(95)<${ANNOUNCEMENT_P95_THRESHOLD_MS}`],
    "http_req_duration{scope:announcement_write}": [`p(95)<${ANNOUNCEMENT_P95_THRESHOLD_MS}`],
    "http_req_duration{scope:message_send}": [`p(95)<${MESSAGE_P95_THRESHOLD_MS}`],
  },
};

const jsonHeaders = {
  headers: {
    "Content-Type": "application/json",
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

function isObjectJson(res) {
  const data = safeJson(res);
  return Boolean(data && typeof data === "object" && !Array.isArray(data));
}

function hasField(res, field) {
  const data = safeJson(res);
  return Boolean(data && Object.prototype.hasOwnProperty.call(data, field));
}

function withClassCode(path, classCode) {
  if (!classCode) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}class_code=${encodeURIComponent(classCode)}`;
}

function postJson(path, body, expectedStatus, label, scope = "setup") {
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    ...jsonHeaders,
    tags: {
      scope,
      name: label,
    },
  });

  if (res.status !== expectedStatus) {
    fail(`${label} failed. Expected ${expectedStatus}, got ${res.status}. Body: ${res.body}`);
  }

  return res;
}

function getJson(path, expectedStatus, label, scope = "setup") {
  const res = http.get(`${BASE_URL}${path}`, {
    tags: {
      scope,
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

  if (value === undefined || value === null || value === "") {
    fail(`${label} did not return required field: ${field}. Body: ${JSON.stringify(json)}`);
  }

  return value;
}

function checkHealthOrFail() {
  const res = http.get(`${BASE_URL}/health`, {
    tags: {
      scope: "health",
      name: "Health check",
    },
  });

  if (res.status !== 200) {
    fail(`Backend is not running at ${BASE_URL}. /health returned ${res.status}.`);
  }
}

function verifyExistingUsers(lecturerIdent, studentIdent, adminIdent) {
  const lecturerThreads = getJson(
    `/communications/lecturer/${encodeURIComponent(lecturerIdent)}/threads`,
    200,
    "Verify existing lecturer communication access"
  );

  if (!Array.isArray(safeJson(lecturerThreads))) {
    fail("Existing lecturer communication list did not return an array.");
  }

  const studentThreads = getJson(
    `/communications/student/${encodeURIComponent(studentIdent)}/threads`,
    200,
    "Verify existing student communication access"
  );

  if (!Array.isArray(safeJson(studentThreads))) {
    fail("Existing student communication list did not return an array.");
  }

  const adminAnnouncements = getJson(
    `/communications/admin/${encodeURIComponent(adminIdent)}/announcements`,
    200,
    "Verify existing admin announcement access"
  );

  if (!Array.isArray(safeJson(adminAnnouncements))) {
    fail("Existing admin announcement list did not return an array.");
  }
}

export function setup() {
  checkHealthOrFail();

  if (EXISTING_LECTURER_IDENT && EXISTING_STUDENT_IDENT && EXISTING_ADMIN_IDENT) {
    verifyExistingUsers(
      EXISTING_LECTURER_IDENT,
      EXISTING_STUDENT_IDENT,
      EXISTING_ADMIN_IDENT
    );

    return {
      lecturerIdent: EXISTING_LECTURER_IDENT,
      studentIdent: EXISTING_STUDENT_IDENT,
      adminIdent: EXISTING_ADMIN_IDENT,
      classCode: EXISTING_CLASS_CODE,
      threadId: EXISTING_THREAD_ID,
    };
  }

  const lecturerIdent = `fclect${RUN_ID}`.toLowerCase();
  const studentIdent = `fcstud${RUN_ID}`.toLowerCase();
  const adminIdent = `fcadmin${RUN_ID}`.toLowerCase();
  const classCode = `K6FC${RUN_ID}`.toUpperCase();

  postJson(
    "/auth/signup",
    {
      full_name: "K6 Feedback Lecturer",
      username: lecturerIdent,
      email: `${lecturerIdent}@example.com`,
      password: PASSWORD,
      role: "lecturer",
    },
    200,
    "Create feedback lecturer test user"
  );

  postJson(
    "/auth/signup",
    {
      full_name: "K6 Feedback Student",
      username: studentIdent,
      email: `${studentIdent}@example.com`,
      password: PASSWORD,
      role: "student",
    },
    200,
    "Create feedback student test user"
  );

  postJson(
    "/auth/signup",
    {
      full_name: "K6 Feedback Admin",
      username: adminIdent,
      email: `${adminIdent}@example.com`,
      password: PASSWORD,
      role: "admin",
    },
    200,
    "Create feedback admin test user"
  );

  const classRes = postJson(
    `/lecturer/${lecturerIdent}/classes`,
    {
      name: `K6 Feedback Collaboration ${RUN_ID}`,
      code: classCode,
      description: "Temporary class created by k6 feedback/collaboration performance smoke test.",
    },
    200,
    "Create feedback collaboration test class"
  );

  const classId = Number(
    requireJsonField(classRes.json(), "id", "Create feedback collaboration class")
  );

  postJson(
    `/student/${studentIdent}/classes/join`,
    {
      classCode,
    },
    200,
    "Join feedback collaboration test class"
  );

  postJson(
    `/communications/admin/${adminIdent}/announcements`,
    {
      subject: `Feedback smoke announcement ${RUN_ID}`,
      body: "This announcement was created by the k6 feedback/collaboration smoke test.",
    },
    200,
    "Create smoke announcement fixture",
    "announcement_write"
  );

  return {
    lecturerIdent,
    studentIdent,
    adminIdent,
    classCode,
    threadId: "",
    classId,
  };
}

export default function (data) {
  const health = http.get(`${BASE_URL}/health`, {
    tags: {
      scope: "health",
      name: "Health check",
    },
  });

  check(health, {
    "health responded 200": (r) => r.status === 200,
  });

  const lecturerThreads = http.get(
    `${BASE_URL}${withClassCode(
      `/communications/lecturer/${encodeURIComponent(data.lecturerIdent)}/threads`,
      data.classCode
    )}`,
    {
      tags: {
        scope: "communication_list",
        name: "Lecturer communication thread list",
      },
    }
  );

  check(lecturerThreads, {
    "lecturer thread list responded 200": (r) => r.status === 200,
    "lecturer thread list returned array": (r) => isArrayJson(r),
  });

  const studentThreads = http.get(
    `${BASE_URL}${withClassCode(
      `/communications/student/${encodeURIComponent(data.studentIdent)}/threads`,
      data.classCode
    )}`,
    {
      tags: {
        scope: "communication_list",
        name: "Student communication thread list",
      },
    }
  );

  check(studentThreads, {
    "student thread list responded 200": (r) => r.status === 200,
    "student thread list returned array": (r) => isArrayJson(r),
  });

  const adminAnnouncements = http.get(
    `${BASE_URL}/communications/admin/${encodeURIComponent(data.adminIdent)}/announcements`,
    {
      tags: {
        scope: "announcement_list",
        name: "Admin announcement list",
      },
    }
  );

  check(adminAnnouncements, {
    "admin announcement list responded 200": (r) => r.status === 200,
    "admin announcement list returned array": (r) => isArrayJson(r),
  });

  const searchAnnouncements = http.get(
    `${BASE_URL}/communications/admin/${encodeURIComponent(
      data.adminIdent
    )}/announcements?search=${encodeURIComponent("Feedback smoke")}`,
    {
      tags: {
        scope: "announcement_list",
        name: "Admin announcement search",
      },
    }
  );

  check(searchAnnouncements, {
    "admin announcement search responded 200": (r) => r.status === 200,
    "admin announcement search returned array": (r) => isArrayJson(r),
  });

  if (data.threadId) {
    const lecturerThreadDetail = http.get(
      `${BASE_URL}/communications/lecturer/${encodeURIComponent(
        data.lecturerIdent
      )}/threads/${data.threadId}`,
      {
        tags: {
          scope: "communication_detail",
          name: "Lecturer thread detail",
        },
      }
    );

    check(lecturerThreadDetail, {
      "lecturer thread detail responded 200": (r) => r.status === 200,
      "lecturer thread detail returned object": (r) => isObjectJson(r),
      "lecturer thread detail has thread": (r) => hasField(r, "thread"),
      "lecturer thread detail has messages": (r) => hasField(r, "messages"),
      "lecturer thread detail has context": (r) => hasField(r, "context"),
    });

    const studentThreadDetail = http.get(
      `${BASE_URL}/communications/student/${encodeURIComponent(
        data.studentIdent
      )}/threads/${data.threadId}`,
      {
        tags: {
          scope: "communication_detail",
          name: "Student thread detail",
        },
      }
    );

    check(studentThreadDetail, {
      "student thread detail responded 200": (r) => r.status === 200,
      "student thread detail returned object": (r) => isObjectJson(r),
      "student thread detail has thread": (r) => hasField(r, "thread"),
      "student thread detail has messages": (r) => hasField(r, "messages"),
      "student thread detail has context": (r) => hasField(r, "context"),
    });

    if (ENABLE_MESSAGE_POST) {
      const sendMessage = http.post(
        `${BASE_URL}/communications/lecturer/${encodeURIComponent(
          data.lecturerIdent
        )}/threads/${data.threadId}/messages`,
        JSON.stringify({
          body: `k6 smoke message ${Date.now()}`,
        }),
        {
          ...jsonHeaders,
          tags: {
            scope: "message_send",
            name: "Lecturer feedback reply post",
          },
        }
      );

      check(sendMessage, {
        "feedback reply post responded 200": (r) => r.status === 200,
        "feedback reply post returned object": (r) => isObjectJson(r),
        "feedback reply post returned ok": (r) => {
          const json = safeJson(r);
          return Boolean(json && json.ok === true);
        },
        "feedback reply post returned message payload": (r) => {
          const json = safeJson(r);
          return Boolean(json && json.message && json.message.body);
        },
      });
    }
  }

  sleep(1);
}