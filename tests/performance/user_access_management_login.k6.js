import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  iterations: 20,
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8000";

export default function () {
  const payload = JSON.stringify({
    email: "student@test.com",
    password: "WrongPassword999!",
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  const res = http.post(`${BASE_URL}/auth/login`, payload, params);

  check(res, {
    "login endpoint responded": (r) => r.status === 200 || r.status === 401 || r.status === 422,
    "response time under 1000ms": (r) => r.timings.duration < 1000,
  });

  sleep(1);
}