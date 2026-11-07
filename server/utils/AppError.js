// server/utils/AppError.js

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperation = true;
  }
}

module.exports = AppError;
