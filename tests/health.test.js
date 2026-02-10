const request = require("supertest");

beforeAll(() => {
  process.env.NODE_ENV = "test";
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

test("GET /health returns ok:true", async () => {
  const { app } = require("../server");
  const res = await request(app).get("/health");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});
