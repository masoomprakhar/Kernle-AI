import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
};

const API = __ENV.API_URL || 'http://127.0.0.1:3000/api';

export function setup() {
  const login = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: 'owner@kernle.local', password: 'demo1234' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const body = login.json();
  return {
    token: body.accessToken,
    org: body.memberships[0].organizationId,
  };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'x-organization-id': data.org,
  };
  const res = http.get(`${API}/pim/products?page=1&pageSize=50`, { headers });
  check(res, { 'products 200': (r) => r.status === 200 });
  sleep(0.5);
}
