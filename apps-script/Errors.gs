class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code || 'INTERNAL_ERROR';
    this.details = details || null;
  }
}

function normalizeError_(error) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'ระบบเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    details: null
  };
}
