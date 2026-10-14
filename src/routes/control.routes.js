const express = require("express");
const { requireAuth, requireOwner, requireCsrf } = require("../middleware/auth");

const authRoutes = require("./auth.routes");
const dashboardRoutes = require("./dashboard.routes");
const ordersRoutes = require("./orders.routes");
const clientsRoutes = require("./clients.routes");
const vehiclesRoutes = require("./vehicles.control.routes");
const tasksRoutes = require("./tasks.routes");
const financesRoutes = require("./finances.routes");
const uploadsRoutes = require("./uploads.routes");
const pushRoutes = require("./push.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use(requireAuth, requireOwner);
router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  return requireCsrf(req, res, next);
});

router.use("/dashboard", dashboardRoutes);
router.use("/orders", ordersRoutes);
router.use("/clients", clientsRoutes);
router.use("/vehicles", vehiclesRoutes);
router.use("/tasks", tasksRoutes);
router.use("/finances", financesRoutes);
router.use("/uploads", uploadsRoutes);
router.use("/push", pushRoutes);

module.exports = router;
