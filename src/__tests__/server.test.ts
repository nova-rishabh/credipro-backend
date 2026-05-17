/**
 * API Route Tests for Credipro Express Server
 *
 * Tests the HTTP API layer including auth, loan operations, and error handling.
 */
import request from 'supertest';

// Set required env vars before importing the app
process.env.JWT_SECRET = 'jest-test-secret-for-api';
process.env.CREDIPRO_ENCRYPTION_KEY = 'jest-test-encryption-key-32chars!!';
process.env.MOCK_ORACLE_MODE = 'true';

// eslint-disable-next-line @typescript-eslint/no-require-imports
import app from '../app';

describe('API /health', () => {
  it('GET /api/health returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('contractAddress');
  });
});

describe('API /auth', () => {
  it('POST /api/auth/token returns JWT for valid username', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: 'test-borrower' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3); // Valid JWT structure
  });

  it('POST /api/auth/token returns 400 for missing username', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({})
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/auth/token returns 400 for empty username', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: '   ' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
  });
});

describe('API /loan (authenticated)', () => {
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: 'loan-tester' })
      .set('Content-Type', 'application/json');

    authToken = res.body.token;
  });

  it('POST /api/loan/request returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/loan/request')
      .send({
        loanAmount: '100000',
        poolAddress: '0x' + 'f'.repeat(64),
        defaultTermDays: '180',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(401);
  });

  it('POST /api/loan/request returns 400 for missing fields', async () => {
    const res = await request(app)
      .post('/api/loan/request')
      .send({ loanAmount: '100000' })
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/loan/request succeeds with valid inputs', async () => {
    const res = await request(app)
      .post('/api/loan/request')
      .send({
        loanAmount: '100000',
        poolAddress: '0x' + 'f'.repeat(64),
        defaultTermDays: '180',
      })
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('loanId');
    expect(res.body).toHaveProperty('proof');
  });

  it('POST /api/loan/slash returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/loan/slash')
      .send({ loanId: '0x' + 'a'.repeat(64) })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(401);
  });

  it('POST /api/loan/slash returns 400 for missing loanId', async () => {
    const res = await request(app)
      .post('/api/loan/slash')
      .send({})
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('API /loan GET', () => {
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: 'get-tester' })
      .set('Content-Type', 'application/json');

    authToken = res.body.token;
  });

  it('GET /api/loan/:id returns 401 without auth', async () => {
    const res = await request(app).get('/api/loan/0x' + 'a'.repeat(64));
    expect(res.status).toBe(401);
  });

  it('GET /api/loan/:id returns loan record', async () => {
    const loanId = '0x' + 'e'.repeat(64);
    const res = await request(app)
      .get(`/api/loan/${loanId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('loanId');
    expect(res.body).toHaveProperty('disbursedAmount');
    expect(res.body).toHaveProperty('isDefaulted');
  });
});

describe('API /oracle', () => {
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: 'oracle-tester' })
      .set('Content-Type', 'application/json');

    authToken = res.body.token;
  });

  it('GET /api/oracle/members returns oracle committee', async () => {
    const res = await request(app)
      .get('/api/oracle/members')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(3);
  });

  it('POST /api/oracle/vote records vote', async () => {
    const res = await request(app)
      .post('/api/oracle/vote')
      .send({
        loanId: '0x' + 'c'.repeat(64),
        oracleMemberId: 'oracle-1',
      })
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/oracle/vote returns 400 for missing fields', async () => {
    const res = await request(app)
      .post('/api/oracle/vote')
      .send({ loanId: '0x' + 'd'.repeat(64) })
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('API /oracle demo endpoints', () => {
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: 'oracle-demo-tester' })
      .set('Content-Type', 'application/json');
    authToken = res.body.token;
  });

  it('POST /api/oracle/auto-vote/:loanId performs two votes in mock mode', async () => {
    const loanId = '0x' + 'c'.repeat(64);
    const res = await request(app)
      .post(`/api/oracle/auto-vote/${loanId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('approvalCount');
    expect(res.body.approvalCount).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/oracle/clear/:loanId clears votes for a loan', async () => {
    const loanId = '0x' + 'c'.repeat(64);
    const res = await request(app)
      .post(`/api/oracle/clear/${loanId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(true);
  });

  it('GET /api/oracle/revealed-identity/:loanId returns identity after consensus', async () => {
    const loanId = '0x' + 'd'.repeat(64);
    // Auto-vote to reach consensus
    const vote = await request(app)
      .post(`/api/oracle/auto-vote/${loanId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(vote.status).toBe(200);

    const res = await request(app)
      .get(`/api/oracle/revealed-identity/${loanId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.identity).toHaveProperty('firstName');
    expect(res.body.identity).toHaveProperty('lastName');
  });

  it('GET /api/oracle/revealed-identity/:loanId returns 403 before consensus', async () => {
    const loanId = '0x' + 'e'.repeat(64);
    // Clear votes first
    await request(app)
      .post(`/api/oracle/clear/${loanId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const res = await request(app)
      .get(`/api/oracle/revealed-identity/${loanId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('approvalCount');
  });

  it('DELETE /api/oracle/reset wipes mock data', async () => {
    const res = await request(app)
      .delete('/api/oracle/reset')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.reset).toBe(true);
  });
});

describe('API /pool', () => {
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ username: 'pool-tester' })
      .set('Content-Type', 'application/json');

    authToken = res.body.token;
  });

  it('GET /api/pool/:address returns pool details', async () => {
    const res = await request(app)
      .get('/api/pool/0x' + 'f'.repeat(64))
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tvl');
    expect(res.body).toHaveProperty('riskParams');
    expect(res.body.riskParams).toHaveProperty('minCreditScore');
  });

  it('GET /api/pool/:address returns 401 without auth', async () => {
    const res = await request(app).get('/api/pool/0x' + 'f'.repeat(64));
    expect(res.status).toBe(401);
  });
});
