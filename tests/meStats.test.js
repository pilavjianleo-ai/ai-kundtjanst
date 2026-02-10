jest.mock("mongoose", () => {
  const modelImpl = (name) => {
    if (name === "User") {
      const user = { _id: "u1", id: "u1", role: "user", password: "hash" };
      return {
        findById: jest.fn(() => ({
          select: jest.fn(async () => user)
        })),
        countDocuments: jest.fn(async () => 0),
      };
    }
    if (name === "Ticket") {
      return {
        countDocuments: jest.fn(async () => 0),
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
  jest.spyOn(console, "log").mockImplementation(() => {});
});

test("GET /me/stats returns stats for role user", async () => {
  const { app } = require("../server");
  const token = jwt.sign({ id: "u1" }, process.env.JWT_SECRET, { expiresIn: "1h" });

  const res = await request(app)
    .get("/me/stats")
    .set("Authorization", "Bearer " + token);

  expect(res.status).toBe(200);
  expect(res.body.role).toBe("user");
  expect(res.body).toHaveProperty("ticketsCreated");
  expect(res.body).toHaveProperty("ticketsResolved");
});
