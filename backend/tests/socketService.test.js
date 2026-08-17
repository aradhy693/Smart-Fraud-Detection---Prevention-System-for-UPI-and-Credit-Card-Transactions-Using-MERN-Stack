const {
  emitBlockedTransaction,
  emitNewTransaction,
  emitSuspiciousTransaction
} = require("../src/services/socketService");

describe("socketService", () => {
  test("scopes transaction events to the admin dashboard room", () => {
    const adminEmit = jest.fn();
    const globalEmit = jest.fn();
    const io = {
      emit: globalEmit,
      to: jest.fn(() => ({ emit: adminEmit }))
    };

    emitNewTransaction({ transactionId: "TXN-1" }, io);
    emitSuspiciousTransaction({ _id: "507f1f77bcf86cd799439012", amount: 1000 }, io);
    emitBlockedTransaction({ _id: "507f1f77bcf86cd799439012", amount: 1000 }, io);

    expect(io.to).toHaveBeenCalledWith("admin-dashboard");
    expect(adminEmit).toHaveBeenCalledWith("new-transaction", { transactionId: "TXN-1" });
    expect(adminEmit).toHaveBeenCalledWith(
      "suspicious-transaction",
      expect.objectContaining({ eventType: "suspicious-transaction" })
    );
    expect(adminEmit).toHaveBeenCalledWith(
      "blocked-transaction",
      expect.objectContaining({ eventType: "blocked-transaction" })
    );
    expect(globalEmit).not.toHaveBeenCalled();
  });
});
