import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const VUS = Number(__ENV.VUS || 3);
const DURATION = __ENV.DURATION || "35s";
const STUDENT_REPORT_P95 = Number(__ENV.STUDENT_REPORT_P95_MS || 6000);
const LECTURER_REPORT_P95 = Number(__ENV.LECTURER_REPORT_P95_MS || 30000);
const REPORT_TEXT_P95 = Number(__ENV.REPORT_TEXT_P95_MS || 8000);
const JOB_POLLING_P95 = Number(__ENV.JOB_POLLING_P95_MS || 1500);

export const options = {
  scenarios: {
    report_smoke: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      gracefulStop: "10s",
    },
  },
  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate<0.01"],
    integrity_uncontrolled_5xx: ["count==0"],
    student_report_list_duration: [`p(95)<${STUDENT_REPORT_P95}`],
    lecturer_report_list_duration: [`p(95)<${LECTURER_REPORT_P95}`],
    report_text_duration: [`p(95)<${REPORT_TEXT_P95}`],
    job_polling_duration: [`p(95)<${JOB_POLLING_P95}`],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8000";
const STUDENT = __ENV.STUDENT_IDENT || "60";
const LECTURER = __ENV.LECTURER_IDENT || "lecturer1";
const SUBMISSION_ID = __ENV.SUBMISSION_ID || "77";

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

const uncontrolled5xx = new Counter("integrity_uncontrolled_5xx");
const studentReportListDuration = new Trend("student_report_list_duration");
const lecturerReportListDuration = new Trend("lecturer_report_list_duration");
const reportTextDuration = new Trend("report_text_duration");
const jobPollingDuration = new Trend("job_polling_duration");

function record(name, response) {
  if (response.status >= 500) uncontrolled5xx.add(1, { endpoint: name });
  if (name === "studentReports") studentReportListDuration.add(response.timings.duration);
  if (name === "lecturerReports") lecturerReportListDuration.add(response.timings.duration);
  if (name === "reportText") reportTextDuration.add(response.timings.duration);
  if (name === "jobPolling") jobPollingDuration.add(response.timings.duration);
}

function controlledStatus(response, allowed = [200, 404, 409]) {
  return allowed.includes(response.status) && response.status < 500;
}

function assertControlled(response, name, allowed = [200, 404, 409]) {
  record(name, response);
  return check(response, {
    [`${name} has a controlled status`]: (r) => controlledStatus(r, allowed),
    [`${name} does not raw crash`]: (r) => r.status < 500,
  });
}

export function setup() {
  http.get(`${BASE_URL}/health`);
  http.get(`${BASE_URL}/student/${STUDENT}/reports`);
  http.get(`${BASE_URL}/lecturer/${LECTURER}/reports`);
}

export default function () {
  group("integrity report summaries", () => {
    const studentReports = http.get(`${BASE_URL}/student/${STUDENT}/reports`, {
      tags: { endpoint: "studentReports" },
      timeout: "35s",
    });
    assertControlled(studentReports, "studentReports", [200, 404]);

    const lecturerReports = http.get(`${BASE_URL}/lecturer/${LECTURER}/reports`, {
      tags: { endpoint: "lecturerReports" },
      timeout: "35s",
    });
    assertControlled(lecturerReports, "lecturerReports", [200, 404]);
  });

  group("integrity report details", () => {
    const reportText = http.get(`${BASE_URL}/lecturer/${LECTURER}/submissions/${SUBMISSION_ID}/report-text`, {
      tags: { endpoint: "reportText" },
      timeout: "35s",
    });
    assertControlled(reportText, "reportText", [200, 404, 409]);

    const jobs = http.get(`${BASE_URL}/integrity/jobs/${SUBMISSION_ID}`, {
      tags: { endpoint: "jobPolling" },
      timeout: "15s",
    });
    assertControlled(jobs, "jobPolling", [200, 404]);
  });

  if (__ITER % 4 === 0) {
    group("integrity PDF smoke", () => {
      const pdf = http.get(`${BASE_URL}/student/${STUDENT}/submissions/${SUBMISSION_ID}/integrity-highlighted-pdf?mode=plagiarism`, {
        tags: { endpoint: "studentPdf" },
        timeout: "35s",
      });
      if (pdf.status >= 500) uncontrolled5xx.add(1, { endpoint: "studentPdf" });
      check(pdf, {
        "studentPdf has a controlled status": (r) => controlledStatus(r, [200, 404, 409]),
        "studentPdf does not raw crash": (r) => r.status < 500,
      });
    });
  }

  sleep(1);
}
