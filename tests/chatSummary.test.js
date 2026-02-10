jest.mock("mongoose", () => {
  const stubUser = { _id: "u1", id: "u1", role: "user", password: "hash" };
  const stubTicket = { _id: "t1", userId: "u1", messages: [], publicTicketId: "T-TEST", companyId: "demo" };
  const stubCompany = { companyId: "demo", settings: { greeting: "Hej", tone: "professional", widgetColor: "#0066cc" } };
  const modelImpl = (name) => {
    if (name === "User") {
      return {
        findById: jest.fn(() => ({
          select: jest.fn(async () => stubUser)
        })),
        findOne: jest.fn(async () => null),
        countDocuments: jest.fn(async () => 0),
      };
    }
    if (name === "Ticket") {
      return {
        findById: jest.fn(async () => stubTicket),
        find: jest.fn(async () => []),
        countDocuments: jest.fn(async () => 0),
        deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
      };
    }
    if (name === "Company") {
      return {
        countDocuments: jest.fn(async () => 1),
        find: jest.fn(async () => [stubCompany]),
        findOne: jest.fn(async () => stubCompany),
      };
    }
    return {};
  };
  return {
    set: jest.fn(),
    connect: jest.fn(() => Promise.resolve()),
    Schema: (() => {
      function Schema() { this.index = jest.fn(); }
      Schema.Types = { ObjectId: function ObjectId() {} };
      return Schema;
    })(),
    Types: { ObjectId: { isValid: () => true } },
    model: (name) => modelImpl(name),
  };
});

const jwt = require("jsonwebtoken");
const request = require("supertest");

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "testsecret";
  delete process.env.OPENAI_API_KEY;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

test("POST /chat/summary returns a summary using fallback when OpenAI key is missing", async () => {
  const { app } = require("../server");
  const token = jwt.sign({ id: "u1" }, process.env.JWT_SECRET, { expiresIn: "1h" });

  const conversation = [
    { role: "user", content: "Hej! Jag undrar över priset." },
    { role: "assistant", content: "Vi erbjuder bas, pro och enterprise." },
    { role: "user", content: "Tack, kan ni skicka offert?" }
  ];

  const res = await request(app)
    .post("/chat/summary")
    .set("Authorization", "Bearer " + token)
    .send({ conversation, companyId: "demo" });

  expect(res.status).toBe(200);
  expect(typeof res.body.summary).toBe("string");
  expect(res.body.summary.length).toBeGreaterThan(10);
});
