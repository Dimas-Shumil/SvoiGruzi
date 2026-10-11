function notFound(req, res) {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Маршрут не найден" });
  }
  return res.status(404).send("404");
}

function errorHandler(error, _req, res, _next) {
  const status = Number.isInteger(error.status) ? error.status : 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    success: false,
    code: error.code || "INTERNAL_ERROR",
    message: status >= 500 ? "Внутренняя ошибка сервера" : error.message,
    ...(error.details ? { details: error.details } : {})
  });
}

module.exports = { notFound, errorHandler };
