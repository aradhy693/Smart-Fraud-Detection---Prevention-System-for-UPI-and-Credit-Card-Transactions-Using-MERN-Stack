const AppError = require("../src/utils/AppError");
const errorHandler = require("../src/middleware/errorMiddleware");

const buildResponse = () => {
  const res = {
    statusCode: 200,
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe("error middleware", () => {
  test("serializes operational errors with status, code, and details", () => {
    const req = {
      method: "GET",
      originalUrl: "/api/example"
    };
    const res = buildResponse();
    const error = new AppError("Alert not found", 404, "ALERT_NOT_FOUND", [
      { field: "id", message: "No matching alert" }
    ]);

    errorHandler(error, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Alert not found",
        error: expect.objectContaining({
          code: "ALERT_NOT_FOUND",
          statusCode: 404,
          details: [{ field: "id", message: "No matching alert" }]
        })
      })
    );
  });

  test("maps mongoose validation errors to HTTP 400", () => {
    const req = {
      method: "POST",
      originalUrl: "/api/transactions/process"
    };
    const res = buildResponse();
    const error = {
      name: "ValidationError",
      errors: {
        amount: {
          path: "amount",
          message: "Amount must be greater than zero"
        }
      },
      stack: "validation stack"
    };

    errorHandler(error, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe("VALIDATION_ERROR");
  });
});
