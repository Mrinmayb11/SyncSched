import express from "express";
import bodyParser from "body-parser";
import 'dotenv/config';
import cors from 'cors';

// Route imports
import webflowRoutes from './routes/webflowRoutes.js';
import notionRoutes from './routes/notionRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

import protectedRoutes from "./api/auth/protected.js";
import notionAuthRouter from "./api/auth/notion_auth.js";

// Initialize express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// Register protected routes
app.use('/api/protected', protectedRoutes);

// Use the Notion auth router (handles frontend redirects)
app.use(notionAuthRouter);

// Register organized route modules
app.use('/api/webflow', webflowRoutes);
app.use('/api/notion', notionRoutes);
app.use('/api/sync', syncRoutes);
app.use('/webhooks', webhookRoutes);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}