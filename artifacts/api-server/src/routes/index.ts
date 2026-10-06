import { Router, type IRouter } from "express";
import healthRouter from "./health";
import classiqAssistantRouter from "./classiq-assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(classiqAssistantRouter);

export default router;
