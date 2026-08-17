const FraudAlert = require("../src/models/FraudAlert");
const Transaction = require("../src/models/Transaction");
const User = require("../src/models/User");

describe("mongoose validation hardening", () => {
  test("rejects invalid transaction documents before MongoDB persistence", () => {
    const transaction = new Transaction({
      amount: -1,
      paymentMethod: "WIRE",
      identifier: "ab",
      ipAddress: "not-an-ip",
      location: {
        latitude: 100,
        longitude: 200
      },
      deviceId: "d",
      fraudScore: 2,
      status: "UNKNOWN"
    });

    const error = transaction.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.amount).toBeDefined();
    expect(error.errors.paymentMethod).toBeDefined();
    expect(error.errors.ipAddress).toBeDefined();
    expect(error.errors["location.latitude"]).toBeDefined();
    expect(error.errors["location.longitude"]).toBeDefined();
    expect(error.errors.fraudScore).toBeDefined();
    expect(error.errors.status).toBeDefined();
  });

  test("enforces strong user validation rules", () => {
    const user = new User({
      name: "A",
      email: "not-email",
      password: "short",
      role: "root"
    });

    const error = user.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.email).toBeDefined();
    expect(error.errors.password).toBeDefined();
    expect(error.errors.role).toBeDefined();
  });

  test("rejects invalid fraud alert status and type", () => {
    const alert = new FraudAlert({
      transactionId: "507f1f77bcf86cd799439012",
      alertType: "UNKNOWN",
      severity: "SEVERE",
      message: "Invalid alert",
      status: "BROKEN"
    });

    const error = alert.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.alertType).toBeDefined();
    expect(error.errors.severity).toBeDefined();
    expect(error.errors.status).toBeDefined();
  });
});
