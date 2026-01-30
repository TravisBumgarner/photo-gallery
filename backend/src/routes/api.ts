import { Router } from 'express';
import { createDb } from 'shared/db';
import { users } from 'shared/db/schema';
import { config } from '../config.js';

const db = createDb(config.DATABASE_URL);

export const router = Router();

// Get all users
router.get('/users', async (req, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create a user
router.post('/users', async (req, res) => {
  try {
    const { name, email } = req.body;
    const newUser = await db.insert(users).values({ name, email }).returning();
    res.status(201).json(newUser[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});
